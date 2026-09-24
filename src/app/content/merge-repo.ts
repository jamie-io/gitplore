import type { EnvironmentId, Project, ProjectLandmark } from './project.model';
import type { RepoOverride } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

/** Used by any repository the overrides file does not colour in. */
const DEFAULT_THEME = { primary: '#3a4a5a', accent: '#e9edf1' } as const;

/** The world a repository nobody has styled yet leads to: neutral, and it flatters a screenshot. */
const DEFAULT_ENVIRONMENT: EnvironmentId = 'showroom';

/**
 * The last resort for a repository with no language and no topics — GitHub gives every repository
 * a `language: null` window right after creation (docs-only, or a language it can't detect yet),
 * and `Project.tags` must never be empty: `merged-projects.spec.ts` requires at least one tag, and
 * an empty list would also render as a visibly blank row of chips in the panel and list.
 */
const DEFAULT_TAG = 'Repository';

/**
 * Below this a GitHub description is metadata, not a summary — "wip", "test", "-". Showing it
 * would put a two-word fragment where the panel and the list expect a sentence, and
 * `merged-projects.spec.ts` (which the deploy runs) requires more than this many characters.
 */
const MIN_USEFUL_SUMMARY = 10;

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/**
 * The last resort for a repository with no German summary and no GitHub description: plain
 * metadata rather than invented prose or a placeholder that reads as a gap.
 */
function factualSummary(repo: SyncedRepo): string {
  const pushed = new Date(repo.pushedAt);
  // `pushedAt` is a UTC timestamp and `mergeRepo` runs in the visitor's browser, so reading it
  // with the local-time getters would shift the printed month for anyone not on UTC — wrong text
  // in front of a reader near a month boundary. Read it back in UTC to match how it was written.
  const when = `${MONTHS[pushed.getUTCMonth()]} ${pushed.getUTCFullYear()}`;

  return repo.language
    ? `${repo.language} · zuletzt aktualisiert im ${when}`
    : `Zuletzt aktualisiert im ${when}`;
}

/** Same reasoning as `factualSummary`: plain metadata, falling back to `DEFAULT_TAG` only when
 * GitHub gives nothing at all to describe the repository with. */
function defaultTags(repo: SyncedRepo): string[] {
  const detected = [repo.language, ...repo.topics].filter((tag): tag is string => !!tag);

  return detected.length > 0 ? detected : [DEFAULT_TAG];
}

/**
 * The repository's own description, but only when it is long enough to read as one.
 *
 * GitHub guarantees nothing about this field, and the deploy runs the schema test on whatever
 * `content:sync` discovered: a repository described as "wip" must fall back rather than break the
 * build (the repo-world design record §3).
 */
function usefulDescription(repo: SyncedRepo): string | undefined {
  const described = repo.description?.trim() ?? '';

  return described.length > MIN_USEFUL_SUMMARY ? described : undefined;
}

/**
 * The repository's slug: a single url path segment, always starting with a letter or digit.
 *
 * GitHub repository names may contain dots (`.github`, `jamie-io.github.io`) and may start with
 * `.`, `-` or `_`, none of which the slug schema allows — and a name nobody has curated must never
 * be able to fail the deploy. Exported because `scripts/sync-readmes.mjs` writes the README file
 * this slug names, so the two must agree character for character.
 */
export function repoSlug(repo: SyncedRepo, override: RepoOverride | undefined): string {
  if (override?.slug) {
    return override.slug;
  }

  const cleaned = repo.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const trimmed = cleaned.replace(/^[^a-z0-9]+/, '');

  // A name made only of separators (`___`) would strip to nothing; prefixing keeps it routable
  // and keeps two such repositories apart, which dropping to a constant would not.
  return trimmed || `repo-${cleaned}`;
}

/** One synced repository plus its override, resolved into the `Project` the world consumes. */
export function mergeRepo(repo: SyncedRepo, override: RepoOverride | undefined): Project {
  const slug = repoSlug(repo, override);
  const landmark: ProjectLandmark = {
    kind: override?.landmark?.kind ?? 'portal',
    ...(override?.landmark?.position ? { position: override.landmark.position } : {}),
    // A truthy check would silently drop a legitimate `rotationY: 0` (facing straight ahead is a
    // real, common value), so numeric fields need the strict `!== undefined` check instead.
    ...(override?.landmark?.rotationY !== undefined
      ? { rotationY: override.landmark.rotationY }
      : {}),
    ...(override?.landmark?.model ? { model: override.landmark.model } : {}),
  };

  return {
    slug,
    title: override?.title ?? repo.name,
    summary: override?.summary ?? usefulDescription(repo) ?? factualSummary(repo),
    tags: override?.tags ?? defaultTags(repo),
    repoUrl: repo.repoUrl,
    ...(repo.pushedAt !== undefined ? { pushedAt: repo.pushedAt } : {}),
    ...(repo.stars !== undefined ? { stars: repo.stars } : {}),
    ...(repo.languages !== undefined ? { languages: repo.languages } : {}),
    ...(repo.commitBuckets !== undefined ? { commitBuckets: repo.commitBuckets } : {}),
    ...(repo.firstCommitAt !== undefined ? { firstCommitAt: repo.firstCommitAt } : {}),
    ...(repo.createdAt !== undefined ? { createdAt: repo.createdAt } : {}),
    ...(repo.license !== undefined ? { license: repo.license } : {}),
    ...(repo.releases !== undefined ? { releases: repo.releases } : {}),
    ...(repo.forks !== undefined ? { forks: repo.forks } : {}),
    ...(repo.openIssues !== undefined ? { openIssues: repo.openIssues } : {}),
    ...(repo.size !== undefined ? { size: repo.size } : {}),
    ...(override?.year !== undefined ? { year: override.year } : {}),
    ...(repo.hasReadme
      ? { readme: { kind: 'bundled' as const, path: `content/readme/${slug}.md` } }
      : {}),
    demo: override?.demo ?? { kind: 'none' },
    landmark,
    environment: override?.environment ?? DEFAULT_ENVIRONMENT,
    theme: override?.theme ?? DEFAULT_THEME,
  };
}

/**
 * The portfolio: every synced repository, minus the hidden ones, merged with its override.
 *
 * The single place that decides which repositories are part of the site. `GithubContentSource`
 * calls it over HTTP and `scripts/lib/portfolio.mjs` calls it over the committed tree, so a
 * portfolio-level rule cannot land in one reader and miss the other.
 *
 * `hidden` is enforced here and not only in `scripts/sync-repos.mjs`, because that sync soft-fails
 * on a network problem: the previously committed `repos.json` then stands, and a repository hidden
 * since the last successful sync would otherwise still get a landmark and still ship.
 *
 * `overrides` is a parameter rather than a default of `REPO_OVERRIDES` for two reasons: the rules
 * can be tested against fixtures, exactly as `hiddenNamesIn` already is, and this module stays
 * free of runtime imports — which is what lets the node scripts load it through type stripping.
 */
export function mergePortfolio(
  repos: readonly SyncedRepo[],
  overrides: Readonly<Record<string, RepoOverride>>,
): readonly Project[] {
  return repos
    .filter((repo) => !overrides[repo.name]?.hidden)
    .map((repo) => mergeRepo(repo, overrides[repo.name]));
}

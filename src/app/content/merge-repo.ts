import type { Project, ProjectLandmark } from './project.model';
import type { RepoOverride } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

/** Used by any repository the overrides file does not colour in. */
const DEFAULT_THEME = { primary: '#3a4a5a', accent: '#e9edf1' } as const;

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

/** One synced repository plus its override, resolved into the `Project` the world consumes. */
export function mergeRepo(repo: SyncedRepo, override: RepoOverride | undefined): Project {
  const slug = override?.slug ?? repo.name.toLowerCase();
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
    summary: override?.summary ?? repo.description ?? factualSummary(repo),
    tags: override?.tags ?? [repo.language, ...repo.topics].filter((tag): tag is string => !!tag),
    repoUrl: repo.repoUrl,
    ...(override?.year !== undefined ? { year: override.year } : {}),
    ...(repo.hasReadme
      ? { readme: { kind: 'bundled' as const, path: `content/readme/${slug}.md` } }
      : {}),
    demo: override?.demo ?? { kind: 'none' },
    landmark,
    theme: override?.theme ?? DEFAULT_THEME,
  };
}

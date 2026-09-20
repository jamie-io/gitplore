/**
 * Which of Jamie's repositories become landmarks, and the shape the app reads them in
 * (repo-design-notes/specs/2026-09-10-repo-worlds-design.md §3).
 */

/** A safety net, not a curation tool: a walkable world, however many repositories exist. */
export const REPO_LIMIT = 12;
export const COMMIT_BUCKET_COUNT = 52;

/** Empty strings are GitHub's "unset"; null says so honestly to every consumer downstream. */
const orNull = (value) => (value ? value : null);

export function toSyncedRepo(apiRepo, enrichment = {}) {
  const repo = {
    name: apiRepo.name,
    description: orNull(apiRepo.description),
    language: orNull(apiRepo.language),
    topics: apiRepo.topics ?? [],
    repoUrl: apiRepo.html_url,
    homepage: orNull(apiRepo.homepage),
    pushedAt: apiRepo.pushed_at,
    stars: apiRepo.stargazers_count,
  };

  if (typeof apiRepo.created_at === 'string') {
    repo.createdAt = apiRepo.created_at;
  }
  if (Object.hasOwn(apiRepo, 'license')) {
    repo.license = apiRepo.license?.spdx_id ?? apiRepo.license?.name ?? null;
  }
  if (typeof apiRepo.forks_count === 'number' && Number.isFinite(apiRepo.forks_count)) {
    repo.forks = apiRepo.forks_count;
  }
  if (typeof apiRepo.open_issues_count === 'number' && Number.isFinite(apiRepo.open_issues_count)) {
    repo.openIssues = apiRepo.open_issues_count;
  }
  if (typeof apiRepo.size === 'number' && Number.isFinite(apiRepo.size)) {
    repo.size = apiRepo.size;
  }

  return withRepoData(repo, enrichment);
}

const REPO_DATA_FIELDS = [
  'languages',
  'commitBuckets',
  'createdAt',
  'license',
  'releases',
  'forks',
  'openIssues',
  'size',
];

/** Adds fresh enrichment while retaining each field from the last committed copy on weather. */
export function withRepoData(repo, enrichment = {}, previous = undefined) {
  const merged = { ...repo };
  for (const field of REPO_DATA_FIELDS) {
    if (enrichment[field] !== undefined) {
      merged[field] = enrichment[field];
    } else if (!Object.hasOwn(merged, field) && previous && Object.hasOwn(previous, field)) {
      merged[field] = previous[field];
    }
  }
  return merged;
}

/** Maps the compact release shape shipped to the browser, with tag/date fallbacks for GitHub data. */
export function toSyncedReleases(releases) {
  if (!Array.isArray(releases)) {
    return [];
  }

  return releases.flatMap((release) => {
    const name =
      typeof release.name === 'string' && release.name.trim()
        ? release.name
        : typeof release.tag_name === 'string' && release.tag_name.trim()
          ? release.tag_name
          : undefined;
    const date =
      typeof release.published_at === 'string'
        ? release.published_at
        : typeof release.created_at === 'string'
          ? release.created_at
          : undefined;

    return name && date ? [{ name, date }] : [];
  });
}

/** Turns the commits returned by GitHub's one-page endpoint into the fixed lifetime ridge shape. */
export function buildCommitBuckets(commits, createdAt, pushedAt) {
  const buckets = Array(COMMIT_BUCKET_COUNT).fill(0);
  const start = Date.parse(createdAt);
  const end = Date.parse(pushedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return buckets;
  }

  const span = end - start;
  for (const commit of Array.isArray(commits) ? commits : []) {
    const rawDate = commit?.commit?.author?.date ?? commit?.commit?.committer?.date;
    const date = Date.parse(rawDate);
    if (!Number.isFinite(date) || date < start || date > end) {
      continue;
    }
    const fraction = span === 0 ? 1 : (date - start) / span;
    const index = Math.min(COMMIT_BUCKET_COUNT - 1, Math.floor(fraction * COMMIT_BUCKET_COUNT));
    buckets[index]++;
  }
  return buckets;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Fetches JSON and retries GitHub's accepted-while-computing response when requested. */
export async function fetchJson(
  url,
  { headers = {}, fetchImpl = fetch, sleep = wait, retryOnAccepted = false, maxRetries = 3 } = {},
) {
  for (let retry = 0; ; retry++) {
    const response = await fetchImpl(url, { headers });
    if (retryOnAccepted && response.status === 202) {
      if (retry >= maxRetries) {
        throw new Error(`HTTP 202 Accepted after ${maxRetries} retries`);
      }
      await sleep(250 * 2 ** retry);
      continue;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

/**
 * Forks and archived repositories are not Jamie's current work, and the hidden list is the
 * explicit escape hatch. The API is asked for `sort=pushed`, so the order that survives here
 * puts the most recently worked-on repository first.
 *
 * `curatedNames` are the repositories `REPO_OVERRIDES` writes copy for. They are never dropped by
 * the cap: an override whose repository fell off the end fails `merged-projects.spec.ts`, which
 * breaks the deploy with the cause several steps from the symptom — and the world would silently
 * lose a hand-written project to keep an auto-discovered one. They still count towards the cap, so
 * an uncurated repository makes way instead and the world stays walkable.
 */
export function selectRepos(apiRepos, hiddenNames, curatedNames = []) {
  const hidden = new Set(hiddenNames);
  const curated = new Set(curatedNames);
  const visible = apiRepos.filter((repo) => !repo.fork && !repo.archived && !hidden.has(repo.name));

  const kept = new Set(visible.filter((repo) => curated.has(repo.name)).map((repo) => repo.name));
  for (const repo of visible) {
    if (kept.size >= REPO_LIMIT) {
      break;
    }
    kept.add(repo.name);
  }

  return visible.filter((repo) => kept.has(repo.name)).map(toSyncedRepo);
}

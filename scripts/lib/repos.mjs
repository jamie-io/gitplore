/**
 * Which of Jamie's repositories become landmarks, and the shape the app reads them in
 * (the repo-world design record §3).
 */

/** A safety net, not a curation tool: a walkable world, however many repositories exist. */
export const REPO_LIMIT = 12;
export const COMMIT_BUCKET_COUNT = 52;

/** Empty strings are GitHub's "unset"; null says so honestly to every consumer downstream. */
const orNull = (value) => (value ? value : null);

export function toSyncedRepo(apiRepo) {
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

  return repo;
}

const REPO_DATA_FIELDS = [
  'languages',
  'commitBuckets',
  'firstCommitAt',
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

/** Indexes the last committed records while tolerating a malformed top-level shape or entries. */
export function indexCommittedRepos(committed) {
  if (!Array.isArray(committed)) {
    return new Map();
  }

  return new Map(
    committed
      .filter((repo) => repo && typeof repo === 'object' && typeof repo.name === 'string')
      .map((repo) => [repo.name, repo]),
  );
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

/** Turns returned commits into the fixed lifetime ridge shape, retaining its earliest known anchor. */
export function buildCommitBuckets(commits, createdAt, pushedAt, firstCommitAt) {
  if (!Array.isArray(commits)) {
    return undefined;
  }

  const start = Date.parse(createdAt);
  const end = Date.parse(pushedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  const dates = [];
  for (const commit of commits) {
    const rawDate = commit?.commit?.author?.date ?? commit?.commit?.committer?.date;
    const date = Date.parse(rawDate);
    if (Number.isFinite(date)) {
      dates.push(date);
    }
  }

  const persistedStart = typeof firstCommitAt === 'string' ? Date.parse(firstCommitAt) : NaN;
  const windowStart = Math.min(
    start,
    ...(Number.isFinite(persistedStart) ? [persistedStart] : []),
    ...dates,
  );
  if (!Number.isFinite(windowStart) || end < windowStart) {
    return undefined;
  }

  const buckets = Array(COMMIT_BUCKET_COUNT).fill(0);
  const span = end - windowStart;
  for (const date of dates) {
    const clampedDate = Math.min(end, Math.max(windowStart, date));
    const fraction = span === 0 ? 1 : (clampedDate - windowStart) / span;
    const index = Math.min(COMMIT_BUCKET_COUNT - 1, Math.floor(fraction * COMMIT_BUCKET_COUNT));
    buckets[index]++;
  }
  return buckets;
}

function oldestCommitAt(commits) {
  let oldest;

  for (const commit of commits) {
    const rawDate = commit?.commit?.author?.date ?? commit?.commit?.committer?.date;
    if (typeof rawDate !== 'string') {
      continue;
    }
    const date = Date.parse(rawDate);
    if (Number.isFinite(date) && (!oldest || date < oldest.date)) {
      oldest = { date, value: rawDate };
    }
  }

  return oldest?.value;
}

/**
 * Builds commit buckets and persists the only anchor that a capped fetch cannot rediscover.
 *
 * A truncated fetch keeps whatever anchor is already committed, so a repository that grows past the
 * page cap keeps meaning its whole lifetime. One case this cannot cover: a repository that is
 * *already* past the cap the very first time it is synced has no committed anchor to keep, so its
 * window starts at the oldest commit the cap returned and creeps forward with every push. Adding
 * such a repository means seeding `firstCommitAt` in `repos.json` by hand once, or reading the true
 * first commit from the `Link: rel="last"` header of `/commits?per_page=1` at the cost of one extra
 * call per repository.
 */
export function buildCommitEnrichment(
  result,
  createdAt,
  pushedAt,
  previousFirstCommitAt = undefined,
) {
  if (!result || !Array.isArray(result.commits)) {
    return undefined;
  }

  const firstCommitAt =
    result.truncated === true
      ? previousFirstCommitAt
      : (oldestCommitAt(result.commits) ?? previousFirstCommitAt);
  const commitBuckets = buildCommitBuckets(result.commits, createdAt, pushedAt, firstCommitAt);
  if (commitBuckets === undefined) {
    return undefined;
  }

  return {
    commitBuckets,
    ...(typeof firstCommitAt === 'string' ? { firstCommitAt } : {}),
  };
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

export const COMMIT_PAGE_SIZE = 100;
export const MAX_COMMIT_PAGES = 3;

/** Fetches enough newest commit pages to expose a useful lifetime shape without exhausting GitHub. */
export async function fetchCommitPages(url, options = {}) {
  const commits = [];
  const separator = url.includes('?') ? '&' : '?';
  let truncated = true;

  for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
    const value = await fetchJson(
      `${url}${separator}per_page=${COMMIT_PAGE_SIZE}&page=${page}`,
      options,
    );
    if (!Array.isArray(value)) {
      throw new Error('invalid commits response');
    }
    commits.push(...value);
    if (value.length < COMMIT_PAGE_SIZE) {
      truncated = false;
      break;
    }
  }

  return { commits, truncated };
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

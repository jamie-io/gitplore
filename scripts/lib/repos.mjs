/**
 * Which of Jamie's repositories become landmarks, and the shape the app reads them in
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §3).
 */

/** A safety net, not a curation tool: a walkable world, however many repositories exist. */
export const REPO_LIMIT = 12;

/** Empty strings are GitHub's "unset"; null says so honestly to every consumer downstream. */
const orNull = (value) => (value ? value : null);

export function toSyncedRepo(apiRepo) {
  return {
    name: apiRepo.name,
    description: orNull(apiRepo.description),
    language: orNull(apiRepo.language),
    topics: apiRepo.topics ?? [],
    repoUrl: apiRepo.html_url,
    homepage: orNull(apiRepo.homepage),
    pushedAt: apiRepo.pushed_at,
    stars: apiRepo.stargazers_count,
  };
}

/**
 * Forks and archived repositories are not Jamie's current work, and the hidden list is the
 * explicit escape hatch. The API is asked for `sort=pushed`, so the order that survives here
 * puts the most recently worked-on repository first.
 */
export function selectRepos(apiRepos, hiddenNames) {
  const hidden = new Set(hiddenNames);

  return apiRepos
    .filter((repo) => !repo.fork && !repo.archived && !hidden.has(repo.name))
    .slice(0, REPO_LIMIT)
    .map(toSyncedRepo);
}

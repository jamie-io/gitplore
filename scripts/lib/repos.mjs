/**
 * Which of Jamie's repositories become landmarks, and the shape the app reads them in
 * (repo-design-notes/specs/2026-09-10-repo-worlds-design.md §3).
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

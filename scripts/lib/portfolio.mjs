/**
 * The portfolio, read from the committed tree — the one place that means "the site's projects".
 *
 * `check-embeddable.mjs`, `capture-screens.mjs`, `optimize-assets.mjs` and the two content specs
 * all used to spell out "read repos.json, merge each entry with its override" for themselves, so a
 * portfolio-level rule (the hidden filter below) could land in one reader and miss the rest.
 * `GithubContentSource` is the deliberate twin of this over HTTP, and applies the same filter.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergePortfolio } from '../../src/app/content/merge-repo.ts';
import { REPO_OVERRIDES } from '../../src/app/content/repo-overrides.ts';

/**
 * Resolved against the working directory rather than `import.meta.url`: npm runs every script
 * with the package root as the cwd, and the Angular vitest builder bundles this module — which
 * rewrites `import.meta.url` to the bundle's location and would send it looking one level above
 * the repository.
 */
const REPOS = join(process.cwd(), 'public', 'content', 'repos.json');

/** Every repository `npm run content:sync` last wrote, hidden ones included. */
export function syncedRepos() {
  return JSON.parse(readFileSync(REPOS, 'utf8'));
}

/**
 * The committed portfolio as the deployed site sees it.
 *
 * The merge rules — including the hidden filter — live in `src/app/content/merge-repo.ts` and are
 * tested there against fixtures, so this side and `GithubContentSource` cannot drift apart.
 */
export function mergedProjects() {
  return mergePortfolio(syncedRepos(), REPO_OVERRIDES);
}

/**
 * Verifies that every `embeddable: true` in the synced portfolio is actually true
 * (IMPLEMENTATION_PLAN.md §5). CI runs this before every build; a mismatch fails the deploy.
 */
import { readFile } from 'node:fs/promises';
import { mergeRepo } from '../src/app/content/merge-repo.ts';
import { REPO_OVERRIDES } from '../src/app/content/repo-overrides.ts';
import { mismatches } from './lib/embeddable.mjs';

const repos = JSON.parse(
  await readFile(new URL('../public/content/repos.json', import.meta.url), 'utf8'),
);
const projects = repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));

const failures = await mismatches(projects);

for (const failure of failures) {
  console.error(`✗ ${failure}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} demo url(s) do not match what the synced portfolio claims.`);
  process.exit(1);
}

console.log(`✓ every iframe demo in the synced portfolio is as embeddable as it claims`);

/**
 * Verifies that every `embeddable: true` in the synced portfolio is actually true
 * (IMPLEMENTATION_PLAN.md §5). CI runs this before every build; a mismatch fails the deploy.
 */
import { mismatches } from './lib/embeddable.mjs';
import { mergedProjects } from './lib/portfolio.mjs';

const failures = await mismatches(mergedProjects());

for (const failure of failures) {
  console.error(`✗ ${failure}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} demo url(s) do not match what the synced portfolio claims.`);
  process.exit(1);
}

console.log(`✓ every iframe demo in the synced portfolio is as embeddable as it claims`);

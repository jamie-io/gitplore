/**
 * Verifies that every `embeddable: true` in projects.ts is actually true (IMPLEMENTATION_PLAN.md
 * §5). CI runs this before every build; a mismatch fails the deploy.
 */
import { PROJECTS } from '../src/app/content/projects.ts';
import { mismatches } from './lib/embeddable.mjs';

const failures = await mismatches(PROJECTS);

for (const failure of failures) {
  console.error(`✗ ${failure}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} demo url(s) do not match what projects.ts claims.`);
  process.exit(1);
}

console.log(`✓ every iframe demo in projects.ts is as embeddable as it claims`);

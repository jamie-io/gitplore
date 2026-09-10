import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialScripts, overBudget } from './budget.mjs';

test('finds the scripts index.html loads up front', () => {
  const html =
    '<script src="main-ABC.js" type="module"></script><script src="polyfills-X.js"></script>';
  assert.deepEqual(initialScripts(html), ['main-ABC.js', 'polyfills-X.js']);
});

test('reports nothing while the gzipped total stays inside the limit', () => {
  assert.equal(overBudget(300, 350), null);
});

test('reports the excess once the limit is passed', () => {
  assert.match(overBudget(400, 350), /400/);
});

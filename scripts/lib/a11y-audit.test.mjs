import assert from 'node:assert/strict';
import { test } from 'node:test';
import { A11Y_ROUTES, auditUrl, failureReports } from './a11y-audit.mjs';

test('a perfect report produces no failures', () => {
  const reports = [{ url: '/projects', score: 1, failedAudits: [] }];

  assert.deepEqual(failureReports(reports), []);
});

test('a report below 1.00 is reported with the audits that failed', () => {
  const reports = [{ url: '/p/deslopify/info', score: 0.96, failedAudits: ['label'] }];

  const failures = failureReports(reports);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /deslopify/);
  assert.match(failures[0], /0\.96/);
  assert.match(failures[0], /label/);
});

test('a report that could not be scored counts as a failure', () => {
  const failures = failureReports([{ url: '/', score: null, failedAudits: [] }]);

  assert.equal(failures.length, 1);
  assert.match(failures[0], /no score/);
});

test('auditUrl joins the base and the route without doubling slashes', () => {
  assert.equal(auditUrl('http://localhost:4173', '/projects'), 'http://localhost:4173/projects');
  assert.equal(auditUrl('http://localhost:4173/', '/projects'), 'http://localhost:4173/projects');
});

test('every 3D route is audited as a desktop with the simple view overridden', () => {
  // Lighthouse emulates a phone by default, and a phone is redirected straight out of the hub by
  // `simpleViewGuard`. Auditing the world without both of these silently scores /projects twice
  // and never looks at the world at all — which is how eleven `label` violations survived.
  const worldRoutes = A11Y_ROUTES.filter((route) => route.world);

  assert.ok(worldRoutes.length >= 2, 'the world itself must be audited');
  for (const route of worldRoutes) {
    assert.equal(route.preset, 'desktop', `${route.path} must be audited as a desktop`);
    assert.match(route.path, /force3d=1/, `${route.path} must override the simple view`);
  }
});

test('the simple view is audited too, as the screen-reader path', () => {
  const simple = A11Y_ROUTES.filter((route) => !route.world);

  assert.ok(simple.some((route) => route.path.startsWith('/projects')));
});

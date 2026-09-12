/**
 * The routes an accessibility audit has to cover, and how each has to be emulated.
 *
 * Lighthouse emulates a phone unless told otherwise, and `simpleViewGuard` redirects every phone
 * out of the 3D hub to `/projects`. An audit of `/` under the default settings therefore scores
 * `/projects` a second time and never looks at a world at all — which is how eleven `label`
 * violations in a README's task lists survived every previous run. World routes are audited as a
 * desktop, with `?force3d=1` overriding the simple view.
 */
export const A11Y_ROUTES = [
  // The screen-reader path (IMPLEMENTATION_PLAN.md §7).
  { path: '/projects', preset: 'mobile', world: false },
  { path: '/projects/deslopify', preset: 'mobile', world: false },
  // The world itself, and a description panel over one. Deslopify's README is the one with GFM
  // task lists, so it exercises the markdown renderer's list path.
  { path: '/?force3d=1', preset: 'desktop', world: true },
  { path: '/p/deslopify/info?force3d=1', preset: 'desktop', world: true },
];

/** The score every route has to reach; the design spec asks for a perfect category (§8). */
export const REQUIRED_SCORE = 1;

/** Joins a base URL and a route path without doubling the slash between them. */
export function auditUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Whether the browser ended up somewhere other than the route we asked it to audit. */
export function landedElsewhere(requested, landed) {
  const path = (url) => new URL(url).pathname.replace(/\/$/, '') || '/';
  return path(requested) !== path(landed);
}

/**
 * One message per route that did not reach `REQUIRED_SCORE` or was not the page we meant to audit,
 * naming the audits that failed. An empty array means every route is perfect.
 *
 * A redirect counts as a failure even at 1.00: `simpleViewGuard` answers a phone by sending it to
 * `/projects`, so a world route that quietly lands there would score perfectly while auditing the
 * wrong page — which is the failure this whole route list exists to prevent.
 */
export function failureReports(reports) {
  return reports.flatMap((report) => {
    if (report.landedOn && landedElsewhere(report.url, report.landedOn)) {
      return [`${report.url}: redirected to ${report.landedOn} — the wrong page was audited`];
    }
    if (typeof report.score !== 'number') {
      return [`${report.url}: no score (the audit did not complete)`];
    }
    if (report.score >= REQUIRED_SCORE) {
      return [];
    }
    const failed = report.failedAudits.length ? report.failedAudits.join(', ') : 'none reported';
    return [`${report.url}: ${report.score.toFixed(2)} — failing audits: ${failed}`];
  });
}

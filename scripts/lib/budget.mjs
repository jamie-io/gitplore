/** Bundle budget helpers (IMPLEMENTATION_PLAN.md §9: initial bundle at most 350 kB gzipped). */

/** The scripts index.html loads on first paint — Angular inlines nothing else that counts. */
export function initialScripts(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
}

/** `null` while the gzipped total (in kB) fits, otherwise a message naming it. */
export function overBudget(totalKb, limitKb) {
  if (totalKb <= limitKb) {
    return null;
  }
  return `initial bundle is ${totalKb.toFixed(1)} kB gzipped, over the ${limitKb} kB budget`;
}

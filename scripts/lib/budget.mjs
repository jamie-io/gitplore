/** Bundle budget helpers (IMPLEMENTATION_PLAN.md §9: initial bundle at most 350 kB gzipped). */

/** The scripts index.html loads on first paint — Angular inlines nothing else that counts. */
export function initialScripts(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
}

/** `null` while the gzipped sizes (in kB) fit, otherwise a message naming the total. */
export function overBudget(gzippedKb, limitKb) {
  const total = Object.values(gzippedKb).reduce((sum, kb) => sum + kb, 0);
  if (total <= limitKb) {
    return null;
  }
  return `initial bundle is ${total.toFixed(1)} kB gzipped, over the ${limitKb} kB budget`;
}

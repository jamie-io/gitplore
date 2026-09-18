/** A source of uniformly distributed numbers in [0, 1). */
export type Random = () => number;

/**
 * Deterministic pseudo-random numbers from a 32-bit linear congruential generator.
 *
 * Every environment is rebuilt whenever the visitor returns to it, so anything placed with this
 * lands in the same spot every time — a tree that moved between visits would read as a bug. The
 * constants are the ones `jungle.ts` used inline, so nothing it placed moves.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** A number in [min, max) drawn from `random`. */
export function between(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

/**
 * Smooth 2D value noise in [0, 1). Cheap and deterministic, for colouring terrain faces and shaping
 * backdrop ridges on the CPU; shaders have their own copy in `shaders/noise.glsl.ts`.
 */
export function valueNoise(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const a = lattice(xi, zi, seed);
  const b = lattice(xi + 1, zi, seed);
  const c = lattice(xi, zi + 1, seed);
  const d = lattice(xi + 1, zi + 1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A hash of one integer lattice point, in [0, 1). */
function lattice(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

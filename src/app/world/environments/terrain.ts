import { ProceduralGround } from './ground';

/** Edge length of the walkable ground, in metres. */
export const TERRAIN_SIZE = 240;

/** Flat plateau around the spawn, so landmarks and the start area sit level. */
export const TERRAIN_FLAT_RADIUS = 14;

/** Largest absolute height the analytic function can produce. */
export const TERRAIN_MAX_HEIGHT = 5.5;

/**
 * Analytic ground height. Three sine octaves rather than noise: it is cheap, deterministic, has no
 * table to ship, and the player controller can sample it directly instead of raycasting
 * (IMPLEMENTATION_PLAN.md §2).
 */
export function terrainHeightAt(x: number, z: number): number {
  const fade = plateauFade(Math.hypot(x, z));
  if (fade === 0) {
    return 0;
  }

  const relief =
    3.2 * Math.sin(x * 0.045) * Math.cos(z * 0.037) +
    1.6 * Math.sin((x + z) * 0.11) +
    0.7 * Math.sin(x * 0.23 + 1.7) * Math.sin(z * 0.19);

  return relief * fade;
}

/** 0 inside the flat radius, easing to 1 by twice that distance. */
function plateauFade(distance: number): number {
  const t = (distance - TERRAIN_FLAT_RADIUS) / TERRAIN_FLAT_RADIUS;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** The clearing's ground: the analytic relief above, drawn at the hub's resolution. */
export class Terrain extends ProceduralGround {
  constructor() {
    super({
      id: 'terrain',
      size: TERRAIN_SIZE,
      color: 0x6c8f5a,
      segments: 160,
      heightAt: terrainHeightAt,
    });
  }
}

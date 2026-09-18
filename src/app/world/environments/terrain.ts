import { GroundOptions, ProceduralGround } from './ground';

/** Edge length of the walkable ground, in metres. */
export const TERRAIN_SIZE = 240;

/** Flat plateau around the spawn, so landmarks and the start area sit level. */
export const TERRAIN_FLAT_RADIUS = 14;

/** Largest absolute height the analytic function can produce. */
export const TERRAIN_MAX_HEIGHT = 5.5;

/**
 * One term of the relief: `amplitude · sin(a₀x + a₁z + a₂) · sin(b₀x + b₁z + b₂)`, the second factor
 * optional. The terrain is a sum of these so that one table can be evaluated here and emitted as
 * GLSL for the grass shader: two hand-written copies of one formula would drift apart.
 */
export interface Wave {
  readonly amplitude: number;
  readonly a: readonly [number, number, number];
  readonly b?: readonly [number, number, number];
}

/** Three sine octaves — the relief the clearing has always had (cos written as a phase-shifted sin). */
export const RELIEF: readonly Wave[] = [
  { amplitude: 3.2, a: [0.045, 0, 0], b: [0, 0.037, Math.PI / 2] },
  { amplitude: 1.6, a: [0.11, 0.11, 0] },
  { amplitude: 0.7, a: [0.23, 0, 1.7], b: [0, 0.19, 0] },
];

/**
 * The clearing's pond: a basin pressed into the relief, front-right of the arrival view (towards
 * the low sun, so it glints) and well outside the landmark ring.
 */
export const POND = { x: 25, z: -52, radius: 9, depth: 1.4 } as const;

function wave(w: Wave, x: number, z: number): number {
  const first = Math.sin(w.a[0] * x + w.a[1] * z + w.a[2]);
  return w.amplitude * first * (w.b ? Math.sin(w.b[0] * x + w.b[1] * z + w.b[2]) : 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The relief, faded to exactly 0 on the plateau around the spawn. */
function reliefAt(x: number, z: number): number {
  const fade = smoothstep(TERRAIN_FLAT_RADIUS, TERRAIN_FLAT_RADIUS * 2, Math.hypot(x, z));
  if (fade === 0) {
    return 0;
  }
  return RELIEF.reduce((sum, w) => sum + wave(w, x, z), 0) * fade;
}

/**
 * The pond's surface: 20 cm below the lowest ground on its rim, sampled densely, so the shore is
 * closed all the way round and the water never floats over dry land.
 */
export const POND_WATER_LEVEL = waterLevel();

function waterLevel(): number {
  let lowest = Infinity;
  for (let step = 0; step <= 8; step++) {
    const ring = 0.9 + step * 0.05;
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      lowest = Math.min(
        lowest,
        reliefAt(
          POND.x + Math.sin(angle) * POND.radius * ring,
          POND.z + Math.cos(angle) * POND.radius * ring,
        ),
      );
    }
  }
  return lowest - 0.2;
}

/**
 * Analytic ground height: the relief plus the pond basin. Cheap, deterministic, no table to ship,
 * and the player controller samples it directly instead of raycasting (IMPLEMENTATION_PLAN.md §2).
 */
export function terrainHeightAt(x: number, z: number): number {
  const relief = reliefAt(x, z);
  const distance = Math.hypot(x - POND.x, z - POND.z);
  const inside = 1 - smoothstep(POND.radius * 0.7, POND.radius * 1.3, distance);
  if (inside === 0) {
    return relief;
  }

  const bed = POND_WATER_LEVEL + POND.depth * ((distance / POND.radius) ** 2 - 1);
  return relief + (bed - relief) * inside;
}

/**
 * `terrainHeightAt` as GLSL, generated from the same tables: defines `float terrainHeight(vec2 p)`
 * with `p = (world x, world z)`. The grass shader stands every blade on it.
 */
export function terrainGlsl(): string {
  const f = (value: number) => value.toFixed(6);
  const factor = (c: readonly [number, number, number]) =>
    `sin(${f(c[0])} * p.x + ${f(c[1])} * p.y + ${f(c[2])})`;
  const term = (w: Wave) => `${f(w.amplitude)} * ${factor(w.a)}${w.b ? ` * ${factor(w.b)}` : ''}`;

  return `
float terrainHeight(vec2 p) {
  float fade = smoothstep(${f(TERRAIN_FLAT_RADIUS)}, ${f(TERRAIN_FLAT_RADIUS * 2)}, length(p));
  float relief = (${RELIEF.map(term).join(' + ')}) * fade;
  float d = distance(p, vec2(${f(POND.x)}, ${f(POND.z)}));
  float inside = 1.0 - smoothstep(${f(POND.radius * 0.7)}, ${f(POND.radius * 1.3)}, d);
  float bed = ${f(POND_WATER_LEVEL)} + ${f(POND.depth)} * (pow(d / ${f(POND.radius)}, 2.0) - 1.0);
  return mix(relief, bed, inside);
}
`;
}

/** The clearing's ground: the analytic relief above, drawn at the hub's resolution. */
export class Terrain extends ProceduralGround {
  constructor(look: Pick<GroundOptions, 'colorAt' | 'decorate'> = {}) {
    super({
      id: 'terrain',
      size: TERRAIN_SIZE,
      color: 0x6c8f5a,
      segments: 160,
      heightAt: terrainHeightAt,
      ...look,
    });
  }
}

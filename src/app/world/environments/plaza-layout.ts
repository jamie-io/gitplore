import type { Collider } from '@engine/player/collision';
import type { HouseOptions } from './architecture';
import { Random, seededRandom } from './random';

/**
 * The metric layout of the Plaza: a 36 m square closed by town houses on three sides, the street
 * and its arch on the south, and four stations on the diagonals around the fountain. Pure data and
 * arithmetic, so the specs, the procedural build and the loaded models all read one plan.
 *
 * World units: metres, fountain at the origin, −Z is north. `rotationY`: 0 faces +Z, so a prop at
 * (x, z) facing the fountain has `rotationY = atan2(-x, -z)`. Kit yaw: 0 faces −Z.
 */

/** Distance from the centre to the house fronts on every side. */
export const FACADE = 18;
export const HOUSE_DEPTH = 4;
/** Edge of the ground plane. */
export const SIZE = 60;
/** Half-width of the street, on the south side only. */
export const STREET = 3;
/** Where the station props stand, on the diagonals. */
export const STATION_RADIUS = 11;
/** Where the glide runs and stops: three metres in front of each prop. */
export const GLIDE_RADIUS = 8;
/** Where cypresses and pots line the square, just in front of the houses. */
export const PLANTING = 16.5;
/** The return portal, in the arch of the south street. */
export const SPAWN = { x: 0, z: 17.5 } as const;
/** The widths of the house models, narrowest first. */
export const HOUSE_WIDTHS = [5, 6, 6.5] as const;

export type HouseVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

/** a, b: 5 m; c, d: 6 m; e, f: 6.5 m. a, c, e two floors (7 m); b, d, f three (10 m). */
export const VARIANTS: Readonly<
  Record<HouseVariant, { width: number; height: number; awning: boolean; lamp: boolean }>
> = {
  a: { width: 5, height: 7, awning: false, lamp: true },
  b: { width: 5, height: 10, awning: false, lamp: false },
  c: { width: 6, height: 7, awning: true, lamp: true },
  d: { width: 6, height: 10, awning: false, lamp: false },
  e: { width: 6.5, height: 7, awning: false, lamp: true },
  f: { width: 6.5, height: 10, awning: true, lamp: false },
};

/**
 * Pastels that stay apart in full sun: ochre, apricot, rose, cream, salmon, sage, powder blue and
 * lemon. The first cut was six sands and creams, which read as one beige wall at noon.
 */
export const STUCCO = [
  0xe8c48a, 0xf0b98f, 0xeab4ae, 0xf2e4c8, 0xe39a7c, 0xc4d2b0, 0xb8cadb, 0xf0d88c,
] as const;
export const SHUTTERS = [0x2f7f78, 0x5f8f35, 0x35609a, 0x8f4535, 0x3f8fa0] as const;
export const AWNINGS = [0x2f6f9f, 0xc2502f, 0x5f8f35, 0xd9a02f] as const;

export type Side = 'north' | 'south' | 'west' | 'east';

export interface HouseSpot {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly seed: number;
  readonly variant: HouseVariant;
  /** Stretch on the house's own X, 1 ≤ stretch ≤ 1.1. */
  readonly stretch: number;
  /** `width` is the variant's width times `stretch`, `depth` HOUSE_DEPTH, `height` the variant's. */
  readonly options: HouseOptions;
}

/** Longest row of houses the enumeration considers. */
const MAX_HOUSES = 8;
/** The widest gap the last house may close by stretching. */
const MAX_GAP = 0.5;
const EPSILON = 1e-9;

/**
 * Widths for a row of houses that fills `length` exactly: every sequence of `HOUSE_WIDTHS` that
 * comes within half a metre short of it, one picked by `random`, the last house stretched over the
 * rest. Enumerated depth-first in `HOUSE_WIDTHS` order, so a seed always gives the same row.
 */
export function rowWidths(
  length: number,
  random: () => number,
): { widths: number[]; stretch: number } {
  const found: { widths: number[]; sum: number }[] = [];
  const sequence: number[] = [];
  const visit = (sum: number) => {
    if (sum >= length - MAX_GAP - EPSILON && sum <= length + EPSILON) {
      found.push({ widths: [...sequence], sum });
      // Every width is wider than the half-metre window, so no longer sequence fits as well.
      return;
    }
    if (sequence.length === MAX_HOUSES || sum > length) {
      return;
    }
    for (const width of HOUSE_WIDTHS) {
      sequence.push(width);
      visit(sum + width);
      sequence.pop();
    }
  };
  visit(0);

  if (found.length === 0) {
    throw new Error(`no row of houses fills ${length} m`);
  }
  const { widths, sum } = found[Math.floor(random() * found.length)];
  const last = widths[widths.length - 1];
  return { widths, stretch: (last + length - sum) / last };
}

function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

const VARIANTS_BY_WIDTH = new Map<number, readonly [HouseVariant, HouseVariant]>(
  HOUSE_WIDTHS.map((width) => {
    const [first, second] = (Object.keys(VARIANTS) as HouseVariant[]).filter(
      (variant) => VARIANTS[variant].width === width,
    );
    return [width, [first, second] as const];
  }),
);

/**
 * One side of the square: houses shoulder to shoulder from corner block to corner block, split by
 * the street when `street` is set. Their fronts stand on `FACADE`, facing the fountain.
 */
export function houseRow(side: Side, seed: number, street: boolean): HouseSpot[] {
  const random = seededRandom(seed);
  // The generator's first draw moves by only 0.0004 from one seed to the next, so the rows seeded
  // 81 to 84 would all pick the same sequence of widths. One draw later they are unrelated.
  random();
  const centre = FACADE + HOUSE_DEPTH / 2;
  const runs: readonly (readonly [number, number])[] = street
    ? [
        [-FACADE, -STREET],
        [STREET, FACADE],
      ]
    : [[-FACADE, FACADE]];
  const spots: HouseSpot[] = [];

  for (const [from, to] of runs) {
    const { widths, stretch: lastStretch } = rowWidths(to - from, random);
    let at = from;
    widths.forEach((nominal, index) => {
      const stretch = index === widths.length - 1 ? lastStretch : 1;
      const [first, second] = VARIANTS_BY_WIDTH.get(nominal)!;
      const variant = random() < 0.5 ? first : second;
      const { height, awning } = VARIANTS[variant];
      const width = nominal * stretch;
      const along = at + width / 2;
      const options: HouseOptions = {
        width,
        depth: HOUSE_DEPTH,
        height,
        stucco: pick(random, STUCCO),
        shutters: pick(random, SHUTTERS),
        awning: awning ? pick(random, AWNINGS) : undefined,
        flowers: random() < 0.5,
      };
      const houseSeed = Math.floor(random() * 1e6);
      const common = { seed: houseSeed, variant, stretch, options };
      spots.push(
        side === 'north'
          ? { x: along, z: -centre, rotationY: 0, ...common }
          : side === 'south'
            ? { x: along, z: centre, rotationY: Math.PI, ...common }
            : side === 'west'
              ? { x: -centre, z: along, rotationY: Math.PI / 2, ...common }
              : { x: centre, z: along, rotationY: -Math.PI / 2, ...common },
      );
      at += width;
    });
  }
  return spots;
}

/** The ground a house covers, as its collider. */
export function footprint(spot: HouseSpot): Extract<Collider, { kind: 'aabb' }> {
  const facesZ = spot.rotationY === 0 || spot.rotationY === Math.PI;
  const halfX = (facesZ ? spot.options.width : HOUSE_DEPTH) / 2;
  const halfZ = (facesZ ? HOUSE_DEPTH : spot.options.width) / 2;
  return {
    kind: 'aabb',
    minX: spot.x - halfX,
    maxX: spot.x + halfX,
    minZ: spot.z - halfZ,
    maxZ: spot.z + halfZ,
  };
}

const OUTER = FACADE + HOUSE_DEPTH;

/**
 * The four corner blocks, each filling `[FACADE, FACADE + HOUSE_DEPTH]²` of its quadrant. The pivot
 * is the block's corner nearest the fountain; at `rotationY` 0 the block covers +X and +Z of it
 * (the south-east corner), and each further quarter turn moves it one corner round.
 */
export const CORNERS: readonly {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
}[] = [
  { x: FACADE, z: FACADE, rotationY: 0 },
  { x: FACADE, z: -FACADE, rotationY: Math.PI / 2 },
  { x: -FACADE, z: -FACADE, rotationY: Math.PI },
  { x: -FACADE, z: FACADE, rotationY: -Math.PI / 2 },
];

export const CORNER_FOOTPRINTS: readonly Extract<Collider, { kind: 'aabb' }>[] = CORNERS.map(
  ({ x, z }) => ({
    kind: 'aabb' as const,
    minX: Math.min(x, Math.sign(x) * OUTER),
    maxX: Math.max(x, Math.sign(x) * OUTER),
    minZ: Math.min(z, Math.sign(z) * OUTER),
    maxZ: Math.max(z, Math.sign(z) * OUTER),
  }),
);

/** The stone arch over the south street; the return portal stands in its opening. */
export const ARCH = { x: 0, z: 17.5, width: 6, opening: 3, depth: 1.2 } as const;

/** The arch's two piers, either side of the opening. */
export const ARCH_PIERS: readonly Extract<Collider, { kind: 'aabb' }>[] = [-1, 1].map((sign) => {
  const inner = ARCH.x + (sign * ARCH.opening) / 2;
  const outer = ARCH.x + (sign * ARCH.width) / 2;
  return {
    kind: 'aabb' as const,
    minX: Math.min(inner, outer),
    maxX: Math.max(inner, outer),
    minZ: ARCH.z - ARCH.depth / 2,
    maxZ: ARCH.z + ARCH.depth / 2,
  };
});

/** Closes the street just short of the ground's edge, so nobody walks off the world. */
export const STREET_BLOCK: Extract<Collider, { kind: 'aabb' }> = {
  kind: 'aabb',
  minX: -STREET,
  maxX: STREET,
  minZ: OUTER - 0.4,
  maxZ: OUTER,
};

/** Festoon masts, listed round the square so consecutive masts share a side. */
export const MASTS: readonly (readonly [number, number])[] = [
  [12, 12],
  [-12, 12],
  [-12, -12],
  [12, -12],
];

/** Where a prop at (x, z) faces the fountain, in the `rotationY` convention (0 faces +Z). */
function facingCentre(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

const BENCH_RADIUS = 5.2;

/** Four benches on the tile ring, north, east, south and west, each facing the fountain. */
export const BENCHES: readonly (readonly [number, number, number])[] = (
  [
    [0, -BENCH_RADIUS],
    [BENCH_RADIUS, 0],
    [0, BENCH_RADIUS],
    [-BENCH_RADIUS, 0],
  ] as const
).map(([x, z]) => [x, z, facingCentre(x, z)] as const);

export const CYPRESSES: readonly (readonly [number, number])[] = [-9, 9].flatMap((along) => [
  [along, -PLANTING] as const,
  [along, PLANTING] as const,
  [-PLANTING, along] as const,
  [PLANTING, along] as const,
]);

/** Two potted olives either side of the portal. */
export const POTS: readonly (readonly [number, number])[] = [
  [-4.5, PLANTING],
  [4.5, PLANTING],
];

export interface PlazaStation {
  readonly key: 1 | 2 | 3 | 4;
  readonly id: 'terminal' | 'board' | 'ridge' | 'languages';
  readonly name: string;
  readonly prop: { readonly x: number; readonly z: number; readonly rotationY: number };
  /** Kit yaw: 0 faces −Z. */
  readonly stand: { readonly x: number; readonly z: number; readonly yaw: number };
}

/** STATION_RADIUS / √2 and GLIDE_RADIUS / √2, to the centimetre, as the plan lists them. */
const PROP = 7.78;
const STAND = 5.66;

/** The commit ridge at the north-east station, along the tangent of the circle. */
export const RIDGE = { from: { x: 5.66, z: -9.9 }, to: { x: 9.9, z: -5.66 } } as const;

function station(
  key: PlazaStation['key'],
  id: PlazaStation['id'],
  name: string,
  [x, z]: readonly [number, number],
  [sx, sz]: readonly [number, number],
): PlazaStation {
  return {
    key,
    id,
    name,
    prop: { x, z, rotationY: facingCentre(x, z) },
    // The kit's yaw from the stand to the prop: 0 faces −Z.
    stand: { x: sx, z: sz, yaw: Math.atan2(-(x - sx), -(z - sz)) },
  };
}

/** Clockwise from the near-left prop as seen from the arrival: SW, NW, NE, SE. */
export const STATIONS: readonly PlazaStation[] = [
  station(1, 'terminal', 'Terminal', [-PROP, PROP], [-STAND, STAND]),
  station(2, 'board', 'Projekttafel', [-PROP, -PROP], [-STAND, -STAND]),
  station(
    3,
    'ridge',
    'Commit-Treppe',
    [(RIDGE.from.x + RIDGE.to.x) / 2, (RIDGE.from.z + RIDGE.to.z) / 2],
    [STAND, -STAND],
  ),
  station(4, 'languages', 'Sprachen', [PROP, PROP], [STAND, STAND]),
];

/** Where a glide to the portal stops: two metres in front of it, facing it. */
export const PORTAL_STAND = { x: 0, z: 15.5, yaw: Math.PI } as const;

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** `p` normalised, or (0, 1) for the zero vector. */
function unit(p: GroundPoint): readonly [number, number] {
  const r = Math.hypot(p.x, p.z);
  return r > 1e-6 ? [p.x / r, p.z / r] : [0, 1];
}

/** Appends `p` unless it lies within `tolerance` of the last point. */
function push(path: GroundPoint[], p: GroundPoint, tolerance: number): void {
  const last = path[path.length - 1];
  if (Math.hypot(p.x - last.x, p.z - last.z) > tolerance) {
    path.push(p);
  }
}

/**
 * Radial to the glide circle, the shorter arc, then straight to `to` if it is off the circle.
 * Starting inside the circle, the first leg runs straight out, away from the fountain. A path of
 * one point means the player already stands there; any longer path ends exactly on `to`.
 */
export function plazaGlidePath(from: GroundPoint, to: GroundPoint): GroundPoint[] {
  const onCircle = (p: GroundPoint): GroundPoint => {
    const r = Math.hypot(p.x, p.z);
    // At the exact centre there is no direction; head for the target instead.
    const [ux, uz] = r > 1e-6 ? [p.x / r, p.z / r] : unit(to);
    return { x: ux * GLIDE_RADIUS, z: uz * GLIDE_RADIUS };
  };
  const path: GroundPoint[] = [{ x: from.x, z: from.z }];
  const entry = onCircle(from);
  push(path, entry, 0.3);
  const exit = onCircle(to);
  const a0 = Math.atan2(entry.z, entry.x);
  let delta = Math.atan2(exit.z, exit.x) - a0;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // shorter arc, in (−π, π]
  const steps = Math.max(1, Math.ceil((Math.abs(delta) * GLIDE_RADIUS) / 0.5));
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    push(path, { x: Math.cos(a) * GLIDE_RADIUS, z: Math.sin(a) * GLIDE_RADIUS }, 0.05);
  }
  // Land exactly on the target: a last circle point within 0.3 m of it gives way to it.
  const end = { x: to.x, z: to.z };
  const last = path[path.length - 1];
  if (Math.hypot(end.x - last.x, end.z - last.z) > 0.3) {
    path.push(end);
  } else if (path.length > 1) {
    path[path.length - 1] = end;
  }
  return path;
}

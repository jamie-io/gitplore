import { Vector3 } from 'three';
import { Basin, basinLevel, pressBasin } from './basin';
import { between, seededRandom } from './random';

/**
 * The Deslopify jungle laid out in world metres: two banks either side of a stream, one bridge
 * across it under the arch, and every spot the flow furnishes. The source is the top-down flow
 * prototype (#2a of the design handoff), a 960 × 680 pixel map; `mapToWorld` is the one
 * conversion from its pixels to this world, so every anchor below is written in map pixels and
 * read in metres. Only positions convert. Sizes are physical (a card is 2.1 m wide, not the map's
 * 34 px icon), and rates and radii stay the flow's business.
 *
 * Nothing here knows about three.js scenes: the environment builds from it, and the flow places
 * its lantern, cards, vines and tags on it. Every exported point is frozen; clone before changing.
 */

/** The rock face behind the north bank, and the notch (x relative to the face) its waterfall pours from. */
export const CLIFF = { x: 0, z: -52, width: 60, height: 16, notch: { x: 9, width: 6 } } as const;
/** The cave behind the waterfall: its back wall sits in the rock, its mouth at the rock's face. */
export const CAVE = { x: CLIFF.x + CLIFF.notch.x, z: CLIFF.z + 1.4 } as const;
/** The plunge pool at the waterfall's foot. */
export const POOL: Basin = { x: CLIFF.x + CLIFF.notch.x, z: CLIFF.z + 6.5, radius: 5, depth: 1.2 };

/**
 * Metres per map pixel. The map's trail from the arrival to the arch is 419 px; at 0.18 m that
 * is 75 m, 17 s at the 4.5 m/s walk, inside the 15–20 s the arrival should take.
 */
export const MAP_SCALE = 0.18;
/** The map pixel of the plunge pool's centre: the one point both coordinate systems share. */
const MAP_POOL = { x: 530, y: 88 } as const;

/**
 * Map pixels to world metres, on the ground plane (`y` = 0; the ground's height is the caller's
 * to sample). The map's `y` grows southwards, like the world's `z`, and the arrival sits at its
 * bottom edge; both axes share one scale, so every angle and every ratio of the map survives:
 * `x = POOL.x + (px − 530) · 0.18`, `z = POOL.z + (py − 88) · 0.18`.
 */
export function mapToWorld(x: number, y: number): Vector3 {
  return new Vector3(
    POOL.x + (x - MAP_POOL.x) * MAP_SCALE,
    0,
    POOL.z + (y - MAP_POOL.y) * MAP_SCALE,
  );
}

/** Gentle, non-repeating relief: the jungle floor before the water cuts into it. */
export function jungleRelief(x: number, z: number): number {
  return 1.4 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.55 * Math.sin((x - z) * 0.21);
}

/**
 * The one water line of the jungle: the plunge pool's, which feeds the brook and the stream, so
 * every surface stands at the same height and the three read as one body of water.
 */
export const WATER_LEVEL = basinLevel(jungleRelief, POOL);

/** A place and the way it faces: `yaw` is a `rotationY`, its front (+Z) along (sin yaw, cos yaw). */
export interface Slot {
  readonly position: Vector3;
  readonly yaw: number;
}

/** A cut in the ground that holds water; the stream and the brook differ only in these numbers. */
export interface WaterCut {
  /** Metres from the centre line to the water's edge. */
  readonly halfWidth: number;
  /** Metres of water over the bed at the centre line. */
  readonly depth: number;
  /** Metres the flat ground either side stands over the water, where the relief is higher. */
  readonly bank: number;
  /** Metres from the centre line that no one walks into. */
  readonly band: number;
}

/**
 * The stream across the clearing (map `y = 298…338`): the only thing between the banks, crossed
 * only on the bridge. Narrower than the map's 7 m band, so the 10 m bridge still reads as a
 * footbridge; `band` keeps the visitor off the bank's last slope into the water.
 */
export const STREAM: WaterCut & { readonly z: number } = {
  z: mapToWorld(0, 318).z,
  halfWidth: 3,
  depth: 1.1,
  bank: 0.8,
  band: 3.45,
};

/** Map pixels of the bridge's centre line (`x = 468…512` on the map, the arch at x = 490). */
const MAP_BRIDGE_X = 490;
const BRIDGE_X = mapToWorld(MAP_BRIDGE_X, 0).x;

/**
 * The stream's centre line: dead straight for 10 m either side of the bridge, so the bridge
 * crosses it square, and meandering by up to 2.5 m further out.
 */
export function streamCentreZ(x: number): number {
  const away = Math.abs(x - BRIDGE_X);
  const t = Math.min(Math.max((away - 10) / 18, 0), 1);
  const meander = t * t * (3 - 2 * t) * 2.2;
  return STREAM.z + meander * (Math.sin(x * 0.045 + 0.7) + 0.4 * Math.sin(x * 0.11 + 2));
}

/**
 * Metres from (x, z) to the stream's centre line: the gap along z, shortened by the line's slope
 * there. Exact where the line is straight, within a few centimetres on its gentle meanders.
 */
export function distanceToStream(x: number, z: number): number {
  // Metres of z per metre of x, over the metre around x.
  const slope = streamCentreZ(x + 0.5) - streamCentreZ(x - 0.5);
  return Math.abs(z - streamCentreZ(x)) / Math.sqrt(1 + slope * slope);
}

/** The stream runs this far either way, past the jungle's edge so its ends are never seen. */
export const STREAM_REACH = { west: -100, east: 100 } as const;

/**
 * The brook that feeds the stream from the plunge pool: out of the pool's south-east rim, along
 * the foot of the cliff and down well east of the feed wall into the stream. It splits the north bank
 * into the bank proper and a pocket to the east, which the path behind the waterfall still joins.
 */
export const BROOK: WaterCut & { readonly path: readonly Vector3[] } = {
  path: [
    freezePoint(new Vector3(12.5, 0, -43.4)),
    freezePoint(new Vector3(26, 0, -46)),
    freezePoint(new Vector3(44, 0, -46)),
    freezePoint(new Vector3(58, 0, -38)),
    freezePoint(new Vector3(62, 0, -24)),
    freezePoint(new Vector3(62, 0, -12)),
    freezePoint(new Vector3(62, 0, streamCentreZ(62))),
  ],
  halfWidth: 1.3,
  depth: 0.7,
  bank: 0.6,
  band: 1.75,
};

/** Metres from (x, z) to the brook's centre line. */
export function distanceToBrook(x: number, z: number): number {
  return nearestOnPath(x, z, BROOK.path).distance;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * `ground` with a watercourse cut into it, `distance` metres from its centre line: a parabolic bed
 * `cut.depth` under the water line in the middle, meeting the water line at `cut.halfWidth`, and a
 * bank rising over the next 2.5 m to a flat strip `cut.bank` over the water, which blends back
 * into the relief by 12 m out. It only ever lowers the ground, so two cuts compose into their
 * union and relief already lower than the bank is left alone.
 */
function cutWater(ground: number, distance: number, cut: WaterCut): number {
  const flat = WATER_LEVEL + cut.bank;
  const plain =
    ground > flat
      ? ground +
        (flat - ground) * (1 - smoothstep(cut.halfWidth + 2.5, cut.halfWidth + 12, distance))
      : ground;
  const bed = Math.min(
    WATER_LEVEL - cut.depth + cut.depth * (distance / cut.halfWidth) ** 2,
    plain,
  );
  return bed + (plain - bed) * smoothstep(cut.halfWidth, cut.halfWidth + 2.5, distance);
}

/**
 * The jungle floor: gentle relief with the stream cut across it, the brook cut from the pool down
 * into the stream, and the plunge pool pressed in under the waterfall. Away from the water it is
 * exactly the relief.
 */
export function jungleHeightAt(x: number, z: number): number {
  return pressBasin(
    (px, pz) =>
      cutWater(
        cutWater(jungleRelief(px, pz), distanceToStream(px, pz), STREAM),
        distanceToBrook(px, pz),
        BROOK,
      ),
    POOL,
    WATER_LEVEL,
    x,
    z,
  );
}

/**
 * The walk surface over the stream, square to it (`yaw` 0: the deck runs along z). `deckHeight`
 * is the planks' top, 20 cm over the flat bank at either end, so walking on is one small step.
 */
export const BRIDGE = {
  centre: freezePoint(new Vector3(BRIDGE_X, 0, STREAM.z)),
  halfWidth: 1.45,
  halfLength: 5,
  yaw: 0,
  deckHeight: WATER_LEVEL + STREAM.bank + 0.2,
} as const;

/** Where the arch stands and the ring starts (map `ARCH = [490, 317]`): the deck's middle. */
export const ARCH = freezePoint(new Vector3(BRIDGE.centre.x, BRIDGE.deckHeight, BRIDGE.centre.z));

/**
 * Standing in this box installs Deslopify. The map's trigger is "on the bridge and north of
 * y = 326", 9 px short of the arch; converted, the box spans the deck from 1.6 m south of the
 * arch to the north end.
 */
export const ARCH_TRIGGER = {
  minX: BRIDGE.centre.x - BRIDGE.halfWidth,
  maxX: BRIDGE.centre.x + BRIDGE.halfWidth,
  minZ: BRIDGE.centre.z - BRIDGE.halfLength,
  maxZ: ARCH.z + 9 * MAP_SCALE,
} as const;

/** Whether (x, z) stands in `ARCH_TRIGGER`. */
export function underArch(x: number, z: number): boolean {
  return (
    x > ARCH_TRIGGER.minX && x < ARCH_TRIGGER.maxX && z > ARCH_TRIGGER.minZ && z < ARCH_TRIGGER.maxZ
  );
}

/** Whether (x, z) lies on the arrival's side of the stream. */
export function onSouthBank(x: number, z: number): boolean {
  return z > streamCentreZ(x);
}

/** The deck's two ends, where the trails meet it. */
export const BRIDGE_SOUTH = freezePoint(
  new Vector3(BRIDGE.centre.x, 0, BRIDGE.centre.z + BRIDGE.halfLength),
);
export const BRIDGE_NORTH = freezePoint(
  new Vector3(BRIDGE.centre.x, 0, BRIDGE.centre.z - BRIDGE.halfLength),
);

/**
 * From the arrival to the bridge (map trail `[490,672] [390,560] [470,440] [490,344]`), ending
 * on the deck's south end. The return portal stands on its first point.
 */
export const SOUTH_TRAIL: readonly Vector3[] = [
  freezePoint(mapToWorld(490, 672)),
  freezePoint(mapToWorld(390, 560)),
  freezePoint(mapToWorld(470, 440)),
  BRIDGE_SOUTH,
];

/** From the bridge's north end up past the feed wall to the pool (map `[490,290] [570,210] [530,125]`). */
export const NORTH_TRAIL: readonly Vector3[] = [
  BRIDGE_NORTH,
  freezePoint(mapToWorld(570, 210)),
  freezePoint(mapToWorld(530, 125)),
];

/** Where arriving visitors appear, facing along the trail's first leg towards the lantern. */
export const SPAWN: Slot = slot(SOUTH_TRAIL[0], SOUTH_TRAIL[1]);

/** Metres the lantern's post stands off the trail: clear of the walk, its arm reaching over it. */
export const LANTERN_OFFSET = 1.7;

/**
 * The lantern on the first leg (map `POST = [452, 630]`). The map stands it on the trail itself;
 * a post there would block the walk, so it stands `LANTERN_OFFSET` to the right of it instead, near
 * enough that walking past lights it. `LANTERN_YAW` turns its arm (the model's −X) over the trail.
 */
const LANTERN = (() => {
  const mapped = mapToWorld(452, 630);
  const { point, along } = nearestOnPath(mapped.x, mapped.z, SOUTH_TRAIL);
  const heading = pointAlong(SOUTH_TRAIL, along + 0.5).sub(pointAlong(SOUTH_TRAIL, along - 0.5));
  heading.normalize();
  // The walker's right hand, with forward along −Z and right along +X at yaw 0.
  const right = { x: -heading.z, z: heading.x };
  return {
    position: freezePoint(
      new Vector3(point.x + right.x * LANTERN_OFFSET, 0, point.z + right.z * LANTERN_OFFSET),
    ),
    yaw: Math.atan2(-right.z, right.x),
  };
})();
export const LANTERN_POST = LANTERN.position;
export const LANTERN_YAW = LANTERN.yaw;

/** The exhibit poster on the north bank (map `(365, 156)`), turned to the bridge. */
export const EXHIBIT: Slot = slot(mapToWorld(365, 156), BRIDGE_NORTH);

/** The feed wall on the north bank (map `WALL = [685, 177]`), turned to the trail's bend below it. */
export const WALL_SLOT: Slot = slot(mapToWorld(685, 177), NORTH_TRAIL[1]);

/** The cave behind the waterfall, where its interactable stands. */
export const CAVE_SLOT = freezePoint(new Vector3(CAVE.x, 0, CAVE.z));

/**
 * Short paths off the north trail to the two things it passes by: the exhibit, west of the
 * bridge head, and the feed wall, east of the trail's bend. Worn into the ground like the trails.
 */
export const NORTH_SPURS: readonly (readonly Vector3[])[] = [
  [freezePoint(mapToWorld(490, 280)), frontOf(EXHIBIT, 2.5)],
  [NORTH_TRAIL[1], frontOf(WALL_SLOT, 3)],
];

/** Every walked line: the two trails, the spurs and the deck between them. */
export const PATHS: readonly (readonly Vector3[])[] = [
  SOUTH_TRAIL,
  [BRIDGE_SOUTH, BRIDGE_NORTH],
  NORTH_TRAIL,
  ...NORTH_SPURS,
];

/** Metres a feed card stands from the trail's centre line: near enough to read in passing. */
export const CARD_OFFSET = 3.5;

/**
 * The four feed cards along the south trail (map `[352,584] [352,494] [505,480] [432,390]`). Each
 * keeps its map side of the trail and its place along it, but stands `CARD_OFFSET` from it rather
 * than the map's 7–11 m, and turns to face the trail a few metres back towards the arrival, so an
 * approaching visitor reads it rather than its edge.
 */
export const CARD_SLOTS: readonly Slot[] = (
  [
    [352, 584],
    [352, 494],
    [505, 480],
    [432, 390],
  ] as const
).map(([x, y]) => besideTrail(mapToWorld(x, y), SOUTH_TRAIL, CARD_OFFSET));

/**
 * Metres over the ground that vines and tags hang from: the Lookdev's canopy line, where the vines'
 * tops sit. Everything that hangs carries its world height in `y`, unlike what stands.
 */
export const HANG = { min: 5.6, max: 6.8 } as const;

/** A vine hangs from `position`, in world space; `radius` is how far its tendrils reach (the map's `r`). */
export interface VineSlot {
  readonly position: Vector3;
  readonly radius: number;
}

/** The map's `VINE_DATA`: `[x, y, r]` in pixels. */
const MAP_VINES: readonly (readonly [number, number, number])[] = [
  [470, 622, 16],
  [430, 598, 18],
  [400, 566, 16],
  [408, 530, 20],
  [432, 492, 16],
  [456, 456, 18],
  [476, 412, 16],
  [488, 372, 18],
  [360, 622, 14],
  [532, 600, 16],
  [542, 500, 18],
  [350, 450, 16],
  [520, 250, 14],
  [455, 205, 16],
  [590, 215, 12],
];

/**
 * Metres from the walked lines within which vines and tags hang. The Lookdev's vines stray up to
 * 2.75 m from the path and its tags hang 2.3 m off it; the map's outermost vines would hang 17 m
 * out in the groves, where no lantern ever reaches them.
 */
const VINE_REACH = 3;
const TAG_REACH = 2.3;

/**
 * A hanging point over map pixel (x, y), brought in to within `reach` of the walked lines like the
 * toys, `HANG` over the ground there, drawn from `random`.
 */
function hangingAt(x: number, y: number, reach: number, random: () => number): Vector3 {
  const point = withinReach(mapToWorld(x, y), reach);
  return freezePoint(
    point.setY(jungleHeightAt(point.x, point.z) + between(random, HANG.min, HANG.max)),
  );
}

/**
 * The fifteen vines, twelve over the south trail and three on the north bank, in map order, each
 * hung from the canopy line over its map spot, brought in to the trail.
 */
export const VINE_SLOTS: readonly VineSlot[] = (() => {
  const random = seededRandom(26);
  return MAP_VINES.map(([x, y, r]) => ({
    position: hangingAt(x, y, VINE_REACH, random),
    radius: r * MAP_SCALE,
  }));
})();

/** The map's `TAG_DATA` positions: the four canonical tags, in `SLOP_TAGS` order. */
const MAP_TAGS: readonly (readonly [number, number])[] = [
  [412, 592],
  [398, 522],
  [458, 462],
  [512, 404],
];
/** Map pixels within which a vine already carries one of the canonical tags. */
const TAG_VINE_GAP = 24;

/**
 * Fifteen tags hung from the canopy line, each turned to the trail; `position` is the world point
 * the tag's cord hangs from. The first four are the map's own tags in `SLOP_TAGS` order; the other
 * eleven hang from the very tops of the vines that carry none of those four, in vine order, so a
 * flow cycling the four tags over all fifteen slots repeats the canonical ones first.
 */
export const TAG_SLOTS: readonly Slot[] = (() => {
  const random = seededRandom(27);
  const canonical = MAP_TAGS.map(([x, y]) => hangingAt(x, y, TAG_REACH, random));
  const inVines = VINE_SLOTS.filter((_, i) =>
    MAP_TAGS.every(
      ([tx, ty]) => Math.hypot(MAP_VINES[i][0] - tx, MAP_VINES[i][1] - ty) > TAG_VINE_GAP,
    ),
  ).map(({ position }) => position);
  return [...canonical, ...inVines].slice(0, 15).map((position) => ({
    position,
    yaw: facingTrail(position).yaw,
  }));
})();

// The toys stand at the map's spots, each on its map side of the trail but brought in to within
// reach of it: the map's 13–26 m off the walk would lose them in the haze, so they stand where a
// passing visitor sees them, turned to the trail.
/** The terminal stele, at the bridge head on the arrival side (map spot `stele`). */
export const STELE: Slot = facingTrail(withinReach(mapToWorld(561, 374), 5));
/** The liana the visitor pulls to reseed the undergrowth, on the north bank (map spot `pull`). */
export const LIANA: Slot = facingTrail(withinReach(mapToWorld(400, 240), 4));
/** The bamboo stand of languages, east of the south trail (map spot `bamboo`). */
export const BAMBOO: Slot = facingTrail(withinReach(mapToWorld(615, 442), 6.5));
/** The release cairns, west of the south trail (map spot `cairn`). */
export const CAIRNS: Slot = facingTrail(withinReach(mapToWorld(320, 412), 6.5));

/**
 * The commit ridge, laid as the boardwalk along the south trail's longest straight leg, from its
 * first bend to its second.
 */
export const RIDGE = { from: SOUTH_TRAIL[1], to: SOUTH_TRAIL[2] } as const;

/** The nearest point to (x, z) on a polyline, and how far along the whole line it lies. */
export function nearestOnPath(
  x: number,
  z: number,
  path: readonly Vector3[],
): { readonly point: Vector3; readonly distance: number; readonly along: number } {
  let best = { point: path[0].clone(), distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const t =
      length > 0 ? Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / length ** 2, 0), 1) : 0;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      best = { point: new Vector3(px, 0, pz), distance, along: walked + length * t };
    }
    walked += length;
  }
  return best;
}

/** The point `along` metres down a polyline, clamped to its ends. */
export function pointAlong(path: readonly Vector3[], along: number): Vector3 {
  let left = Math.max(along, 0);
  for (let i = 0; i < path.length - 1; i++) {
    const length = path[i].distanceTo(path[i + 1]);
    if (left <= length) {
      return path[i].clone().lerp(path[i + 1], length > 0 ? left / length : 0);
    }
    left -= length;
  }
  return path[path.length - 1].clone();
}

/** Metres from the arrival to the arch along the south trail and the deck. */
export function arrivalToArch(): number {
  let length = 0;
  for (let i = 0; i < SOUTH_TRAIL.length - 1; i++) {
    length += SOUTH_TRAIL[i].distanceTo(SOUTH_TRAIL[i + 1]);
  }
  return length + BRIDGE.halfLength;
}

function freezePoint(point: Vector3): Vector3 {
  return Object.freeze(point) as Vector3;
}

/** A slot at `position` turned towards `target`. */
function slot(position: Vector3, target: Vector3): Slot {
  return {
    position: freezePoint(position.clone().setY(0)),
    yaw: Math.atan2(target.x - position.x, target.z - position.z),
  };
}

/** `metres` in front of a slot. */
function frontOf(place: Slot, metres: number): Vector3 {
  return freezePoint(
    new Vector3(
      place.position.x + Math.sin(place.yaw) * metres,
      0,
      place.position.z + Math.cos(place.yaw) * metres,
    ),
  );
}

/** A slot at `position` turned to the nearest point of any walked line. */
function facingTrail(position: Vector3): Slot {
  return slot(position, nearestWalked(position).point);
}

/** The nearest point of any walked line to `position`. */
function nearestWalked(position: Vector3): ReturnType<typeof nearestOnPath> {
  return PATHS.map((path) => nearestOnPath(position.x, position.z, path)).reduce((a, b) =>
    b.distance < a.distance ? b : a,
  );
}

/** `point` brought in to at most `reach` metres from the nearest walked line, on its own side. */
function withinReach(point: Vector3, reach: number): Vector3 {
  const nearest = nearestWalked(point);
  return nearest.distance <= reach
    ? point
    : nearest.point.clone().lerp(point, reach / nearest.distance);
}

/**
 * `mapped` pulled in to `offset` metres from `path` on its own side, turned to the point four
 * metres back along the path from the one it stands beside.
 */
function besideTrail(mapped: Vector3, path: readonly Vector3[], offset: number): Slot {
  const nearest = nearestOnPath(mapped.x, mapped.z, path);
  const side = mapped.clone().sub(nearest.point).setY(0).normalize();
  const position = nearest.point.clone().addScaledVector(side, offset);
  return slot(position, pointAlong(path, nearest.along - 4));
}

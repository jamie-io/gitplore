/**
 * The Deslopify Lichtung laid out in world metres: a bowl 58 × 43 m on one south–north axis, from
 * the arrival ledge over the marsh boardwalk and up the commit steps to the arch on its deck over
 * the rill, then round the north loop past the exhibit and the feed wall to the cave behind the
 * waterfall. The source is the handoff prototype (spec §1), drawn at 10 px = 1 m with the arch at
 * its origin: `x = (px − 320) / 10`, `z = (py − 240) / 10`, north along −z.
 *
 * Nothing here knows about three.js: the environment builds from it, and the flow places its
 * lantern, cards, vines and tags on it. Every exported point is frozen.
 *
 * Two conventions for `yaw`. A station stand's or the portal's is the visitor's heading, the
 * player's own convention: 0 looks north (−z), forward is (−sin yaw, −cos yaw). A prop's (the
 * exhibit, the wall, a card) is its `rotationY`: 0 faces south (+z), its front along
 * (sin yaw, cos yaw). A visitor looks straight at a prop's front when the two yaws are equal.
 */

/** A point on the ground plane, in metres. */
export interface Pt {
  readonly x: number;
  readonly z: number;
}

/** A point and the way it faces; see the file comment for which convention `yaw` follows. */
export interface Placed extends Pt {
  readonly yaw: number;
}

function pt(x: number, z: number): Pt {
  return Object.freeze({ x, z });
}

function placed(x: number, z: number, yaw: number): Placed {
  return Object.freeze({ x, z, yaw });
}

/** The player's heading from `from` towards `to` (0 looks north). */
function heading(from: Pt, to: Pt): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The bowl: the ellipse centred on the arch that everything walkable stands in. */
export const BOWL = { rx: 29.2, rz: 21.4 } as const;

/** Whether (x, z) lies inside the bowl's ellipse. */
export function inBowl(x: number, z: number): boolean {
  return (x / BOWL.rx) ** 2 + (z / BOWL.rz) ** 2 < 1;
}

/** Metres (x, z) lies beyond the bowl's edge, measured along the ray from the arch; negative inside. */
export function beyondBowl(x: number, z: number): number {
  const e = Math.hypot(x / BOWL.rx, z / BOWL.rz);
  return e > 1e-9 ? ((e - 1) * Math.hypot(x, z)) / e : -Math.min(BOWL.rx, BOWL.rz);
}

/** Where arriving visitors appear, on the ledge, looking north along the axis through the arch. */
export const PORTAL: Placed = placed(0, 20.6, 0);

/**
 * The lantern's post on the ledge, just before the ramp, 0.75 m west of the boardwalk's bend at
 * (−2, 18) so the walk passes it; its arm (the model's −X) reaches east over the walk.
 */
export const LANTERN_POST: Placed = placed(-2.6, 18.5, Math.PI);

/** The arch, over the middle of its deck: the origin. */
export const ARCH: Pt = pt(0, 0);

/** The deck under the arch, over the rill: 2.9 m wide, 3.2 m long, its planks' top 2.4 m up. */
export const DECK = { halfWidth: 1.45, halfLength: 1.6, height: 2.4 } as const;

/** The box that installs Deslopify: the middle of the deck, between the arch's pillars. */
const ARCH_TRIGGER = { minX: -1.4, maxX: 1.4, minZ: -0.8, maxZ: 0.8 } as const;

/** Whether (x, z) stands under the arch. */
export function underArch(x: number, z: number): boolean {
  return (
    x > ARCH_TRIGGER.minX && x < ARCH_TRIGGER.maxX && z > ARCH_TRIGGER.minZ && z < ARCH_TRIGGER.maxZ
  );
}

/**
 * Whether the segment from `a` to `b` passes under the arch: a glide or a long frame can carry the
 * visitor from one side of the trigger to the other without ever standing in it.
 */
export function crossesArch(a: Pt, b: Pt): boolean {
  let enter = 0;
  let leave = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // Liang–Barsky: clip the segment's parameter range against each of the box's four sides.
  const sides: readonly (readonly [number, number])[] = [
    [-dx, a.x - ARCH_TRIGGER.minX],
    [dx, ARCH_TRIGGER.maxX - a.x],
    [-dz, a.z - ARCH_TRIGGER.minZ],
    [dz, ARCH_TRIGGER.maxZ - a.z],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q <= 0) {
        return false;
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      enter = Math.max(enter, t);
    } else {
      leave = Math.min(leave, t);
    }
    if (enter > leave) {
      return false;
    }
  }
  return true;
}

/** The eleven commit steps, from the boardwalk's end up to the deck: 0.8 → 2.4 m over 4.8 m. */
export const STEPS = {
  from: pt(-3.8, 5.2),
  to: pt(0, 2.2),
  count: 11,
  bottom: 0.8,
  top: 2.4,
} as const;

/** The middle of each step's tread and its top: step `i` rises to `bottom + rise · (i + 1)`. */
export function stepCentres(): readonly (Pt & { readonly y: number })[] {
  const rise = (STEPS.top - STEPS.bottom) / STEPS.count;
  return Array.from({ length: STEPS.count }, (_, i) => {
    const t = (i + 0.5) / STEPS.count;
    return Object.freeze({
      x: STEPS.from.x + (STEPS.to.x - STEPS.from.x) * t,
      z: STEPS.from.z + (STEPS.to.z - STEPS.from.z) * t,
      y: STEPS.bottom + rise * (i + 1),
    });
  });
}

/** The boardwalk from the portal over the marsh to the foot of the steps. */
export const BOARDWALK: readonly Pt[] = Object.freeze([
  PORTAL,
  pt(-2, 18),
  pt(-5.8, 15.2),
  pt(-7.6, 11.4),
  pt(-6.6, 7.8),
  STEPS.from,
]);

/**
 * From the arch north to the exhibit, round the feed wall's west end and the pool's east side,
 * in through the cave's mouth behind the waterfall and out again, and back past the pool's west
 * side to the exhibit. The walk into the cave keeps a body's width off the mouth's jambs and the
 * pool's edge.
 */
export const NORTH_LOOP: readonly Pt[] = Object.freeze([
  ARCH,
  pt(0, -9),
  pt(4.6, -11.2),
  pt(4.9, -12.4),
  pt(4.8, -14.2),
  pt(3.9, -17.6),
  pt(2.4, -19.2),
  pt(1.25, -19.5),
  pt(0.9, -20.4),
  pt(0, -21),
  pt(-0.9, -20.4),
  pt(-1.25, -19.5),
  pt(-2.4, -19.2),
  pt(-3.7, -17.8),
  pt(-2.8, -14),
  pt(0, -9),
]);

/** Off the north loop to the feed wall: from beside its west end to station 6, in front of it. */
export const WALL_SPUR: readonly Pt[] = Object.freeze([pt(4.9, -12.4), pt(8.4, -12)]);

/** Every walked line: the boardwalk, the steps, the deck, the north loop and the spur to the wall. */
export const PATHS: readonly (readonly Pt[])[] = Object.freeze([
  BOARDWALK,
  Object.freeze([STEPS.from, STEPS.to]),
  Object.freeze([STEPS.to, ARCH]),
  NORTH_LOOP,
  WALL_SPUR,
]);

/** Every walked segment as numbers, `ax, az, dx, dz` four to a segment, for allocation-free lookups. */
const PATH_SEGMENTS: Float64Array = (() => {
  const values: number[] = [];
  for (const path of PATHS) {
    for (let i = 1; i < path.length; i++) {
      values.push(
        path[i - 1].x,
        path[i - 1].z,
        path[i].x - path[i - 1].x,
        path[i].z - path[i - 1].z,
      );
    }
  }
  return Float64Array.from(values);
})();

/** The strip in front of the cave where the visitor passes behind the falling water. */
export const BEHIND_FALLS = { x0: -1.2, x1: 1.2, z0: -21, z1: -18.2 } as const;

/** The nearest point to (x, z) on a polyline, how far from it, and how far along the line. */
export function nearestOnPath(
  x: number,
  z: number,
  path: readonly Pt[],
): { readonly x: number; readonly z: number; readonly distance: number; readonly along: number } {
  let best = { x: path[0].x, z: path[0].z, distance: Infinity, along: 0 };
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
      best = { x: px, z: pz, distance, along: walked + length * t };
    }
    walked += length;
  }
  return best;
}

/** The point `along` metres down a polyline, clamped to its ends. */
export function pointAlong(path: readonly Pt[], along: number): Pt {
  let left = Math.max(along, 0);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length) {
      const t = length > 0 ? left / length : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= length;
  }
  const end = path[path.length - 1];
  return { x: end.x, z: end.z };
}

/**
 * Metres from (x, z) to the nearest walked line. Allocates nothing: the ground's height reads it,
 * and the player and the camera read the ground every frame.
 */
export function distanceToPaths(x: number, z: number): number {
  let nearest = Infinity;
  for (let i = 0; i < PATH_SEGMENTS.length; i += 4) {
    const ax = PATH_SEGMENTS[i];
    const az = PATH_SEGMENTS[i + 1];
    const dx = PATH_SEGMENTS[i + 2];
    const dz = PATH_SEGMENTS[i + 3];
    const length = dx * dx + dz * dz;
    const t = length > 0 ? Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / length, 0), 1) : 0;
    const ex = x - ax - dx * t;
    const ez = z - az - dz * t;
    nearest = Math.min(nearest, ex * ex + ez * ez);
  }
  return Math.sqrt(nearest);
}

/** Metres along a polyline, end to end. */
export function pathLength(points: readonly Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return length;
}

/** Every segment of the walked lines, once. */
const SEGMENTS: readonly (readonly [Pt, Pt])[] = PATHS.flatMap((path) =>
  path.slice(1).map((end, i) => [path[i], end] as const),
);

/** The segment nearest `point`, and the point on it nearest `point`. */
function joinPaths(point: Pt): { readonly segment: number; readonly at: Pt } {
  let best = { segment: 0, at: SEGMENTS[0][0], distance: Infinity };
  SEGMENTS.forEach(([a, b], segment) => {
    const near = nearestOnPath(point.x, point.z, [a, b]);
    if (near.distance < best.distance) {
      best = { segment, at: { x: near.x, z: near.z }, distance: near.distance };
    }
  });
  return best;
}

/**
 * The shortest way from `from` to `to` over the walked lines: each end joins the segment nearest
 * it, at the segment's nearest point or straight at either of its ends, whichever makes the route
 * shorter, and the route between runs along the lines (Dijkstra over their vertices). Starts with
 * `from` and ends with `to`, exactly as given.
 */
export function glidePath(from: Pt, to: Pt): readonly Pt[] {
  const nodes: Pt[] = [];
  const index = new Map<string, number>();
  const node = (point: Pt): number => {
    const key = `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
    let at = index.get(key);
    if (at === undefined) {
      at = nodes.length;
      index.set(key, at);
      nodes.push(point);
    }
    return at;
  };

  const start = joinPaths(from);
  const end = joinPaths(to);
  const edges: (readonly [number, number])[] = [];
  SEGMENTS.forEach(([a, b], segment) => {
    const cuts = [start, end].filter((joined) => joined.segment === segment).map(({ at }) => at);
    const points = [a, ...cuts, b].sort(
      (p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z),
    );
    for (let i = 1; i < points.length; i++) {
      edges.push([node(points[i - 1]), node(points[i])]);
    }
  });
  const source = node(from);
  const target = node(to);
  for (const [point, joined] of [
    [source, start],
    [target, end],
  ] as const) {
    const [a, b] = SEGMENTS[joined.segment];
    edges.push([point, node(joined.at)], [point, node(a)], [point, node(b)]);
  }

  const distance = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const done = nodes.map(() => false);
  distance[source] = 0;
  for (;;) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && distance[i] < Infinity && (next < 0 || distance[i] < distance[next])) {
        next = i;
      }
    }
    if (next < 0 || next === target) {
      break;
    }
    done[next] = true;
    for (const [a, b] of edges) {
      const other = a === next ? b : b === next ? a : -1;
      if (other < 0) {
        continue;
      }
      const via =
        distance[next] + Math.hypot(nodes[other].x - nodes[next].x, nodes[other].z - nodes[next].z);
      if (via < distance[other]) {
        distance[other] = via;
        previous[other] = next;
      }
    }
  }

  const route: Pt[] = [];
  for (let at = target; at >= 0; at = previous[at]) {
    route.unshift(nodes[at]);
  }
  if (route.length < 2 || route[0] !== nodes[source]) {
    return [from, to];
  }
  // `from` and `to` themselves, first and last, as given.
  route[0] = from;
  route[route.length - 1] = to;
  return route;
}

/**
 * Where the visitor stands at each station, facing what it shows. The lantern's stand is on the
 * walk east of its post, facing it. The feed wall's is where the prototype puts station 6
 * (404, 120), a metre in front of the wall rather than the spec table's 2.4 m, at the end of the
 * spur to it: from there the leg on to the cave, round the wall and the pool, stays within 16 m.
 */
export const STATION_STANDS = Object.freeze({
  laterne: placed(-1, 18, heading(pt(-1, 18), LANTERN_POST)),
  pfad: placed(-7, 11.6, heading(pt(-7, 11.6), pt(-6.6, 7.8))),
  stufen: placed(-2, 3.8, heading(STEPS.from, STEPS.to)),
  bogen: placed(0, 0, 0),
  exponat: placed(0, -5.6, 0),
  wand: placed(8.4, -12, 0),
  hoehle: placed(0, -21.6, 0),
}) satisfies Readonly<
  Record<'laterne' | 'pfad' | 'stufen' | 'bogen' | 'exponat' | 'wand' | 'hoehle', Placed>
>;

/** The stations in story order, portal to cave. */
export const TOUR: readonly (keyof typeof STATION_STANDS)[] = Object.freeze([
  'laterne',
  'pfad',
  'stufen',
  'bogen',
  'exponat',
  'wand',
  'hoehle',
] as const);

/** The exhibit's easel on the glade, its screen facing south down the axis. */
export const EXHIBIT: Placed = placed(0, -9, 0);
/** The feed wall's centre, facing south. */
export const WALL: Placed = placed(8.4, -13, 0);
/** The terminal stele inside the cave, facing its mouth. */
export const STELE: Placed = placed(0, -22, 0);
/** The release cairn beside the exhibit. */
export const CAIRN: Pt = pt(3.6, -8);
/** The liana lever east of the feed wall, turned west to the visitor coming from the wall. */
export const LIANA: Placed = placed(12.6, -10.6, -Math.PI / 2);
/** The firefly swarm over the exhibit glade: its centre and its radii. */
export const FIREFLY_GLADE: Pt & { readonly rx: number; readonly rz: number } = Object.freeze({
  x: 0,
  z: -11.6,
  rx: 5,
  rz: 3,
});

/** The four bamboo stalks of the languages at the deck's corners, largest share first. */
export const BAMBOO: readonly Pt[] = Object.freeze([
  pt(-2, -1.4),
  pt(2, -1.4),
  pt(-2, 1.6),
  pt(2, 1.6),
]);

/** The plunge pool at the waterfall's foot: water at `level`, blocking the walk. */
export const POOL: Pt & { readonly rx: number; readonly rz: number; readonly level: number } =
  Object.freeze({ x: 0, z: -17.6, rx: 3, rz: 1.5, level: 0.4 });
/** Metres of water over the pool's bed at its middle. */
export const POOL_DEPTH = 0.9;

/** The cliff face across the bowl's north end: where its face stands, how wide and how tall. */
export const CLIFF = { z: -19.8, width: 30, height: 9 } as const;

/**
 * The waterfall: pouring from the cliff top at `x0…x1` over the face at `z`, down to the pool's
 * water. It leans out as it falls, so the visitor passes behind it into the cave.
 */
export const WATERFALL = {
  x0: -1,
  x1: 1,
  z: CLIFF.z,
  top: CLIFF.height,
  bottom: POOL.level,
} as const;

/** The cave behind the falls: its inside, from the mouth at `z1` back to `z0`, floor and height. */
export const CAVE = { x0: -1.6, x1: 1.6, z0: -23.4, z1: -19.8, floor: 0.4, height: 2.6 } as const;

/**
 * The rill's centre line: the prototype's cubic Bézier `M20,238 C160,252 480,226 620,242`. Its
 * water stands at 0, its bed 0.8 m under it.
 */
const RILL_CURVE = [pt(-30, -0.2), pt(-16, 1.2), pt(16, -1.4), pt(30, 0.2)] as const;
export const RILL_BED = -0.8;
/** Metres over which the rill's bank climbs from the water's edge to the ground either side. */
const RILL_BANK = 0.5;

function bezier(t: number, axis: 'x' | 'z'): number {
  const [p0, p1, p2, p3] = RILL_CURVE;
  const u = 1 - t;
  return (
    u * u * u * p0[axis] +
    3 * u * u * t * p1[axis] +
    3 * u * t * t * p2[axis] +
    t * t * t * p3[axis]
  );
}

/** The centre line sampled every quarter metre of x, which the curve runs along one way only. */
const RILL_STEP = 0.25;
const RILL_TABLE: readonly number[] = (() => {
  const from = RILL_CURVE[0].x;
  const count = Math.round((RILL_CURVE[3].x - from) / RILL_STEP) + 1;
  return Array.from({ length: count }, (_, i) => {
    const x = from + i * RILL_STEP;
    let low = 0;
    let high = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (low + high) / 2;
      if (bezier(mid, 'x') < x) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return bezier((low + high) / 2, 'z');
  });
})();

/** The rill across the bowl, which only the deck crosses: 1.8 m of water between its banks. */
export const RILL: { readonly halfWidth: 0.9; centreZ(x: number): number } = {
  halfWidth: 0.9,
  /** The z of the rill's centre line at `x`; level past the curve's ends. */
  centreZ(x: number): number {
    const at = (x - RILL_CURVE[0].x) / RILL_STEP;
    if (at <= 0) {
      return RILL_TABLE[0];
    }
    if (at >= RILL_TABLE.length - 1) {
      return RILL_TABLE[RILL_TABLE.length - 1];
    }
    const i = Math.floor(at);
    return RILL_TABLE[i] + (RILL_TABLE[i + 1] - RILL_TABLE[i]) * (at - i);
  },
};

/** The rill's ends: its water runs from one side of the rim to the other. */
export const RILL_REACH = { west: RILL_CURVE[0].x - 1, east: RILL_CURVE[3].x + 1 } as const;

/**
 * Metres from (x, z) to the rill's centre line: the gap along z, shortened by the line's slope
 * there. Within a centimetre on its gentle curve.
 */
export function distanceToRill(x: number, z: number): number {
  const slope = RILL.centreZ(x + 0.5) - RILL.centreZ(x - 0.5);
  return Math.abs(z - RILL.centreZ(x)) / Math.sqrt(1 + slope * slope);
}

/** The section's heights (spec §1, "Heights"). */
const LEDGE = 3;
const MARSH = 0.3;
const GLADE = 1;
const RAMP = { from: 14.5, to: 17.5 } as const;
/** Where the glade proper starts: between it and the deck, a ramp down from the deck's north end. */
const GLADE_FROM = -3.4;
/** The rim's height beyond the bowl: west, north and east, and the lower south lip. */
const RIM = { high: 12, low: 7 } as const;
/** The ground behind the cliff face, inside the rock, before the rim climbs on. */
const CLIFF_GROUND = CLIFF.height + 1;

/**
 * The ground before the water and the rock: the ledge, the ramp and the marsh south of the rill,
 * the glade north of it, and a ramp from the deck's north end down to the glade.
 */
function sectionHeight(x: number, z: number): number {
  const south = MARSH + (LEDGE - MARSH) * smoothstep(RAMP.from, RAMP.to, z);
  const landing =
    (DECK.height - 0.1 - GLADE) *
    smoothstep(GLADE_FROM, -DECK.halfLength, z) *
    (1 - smoothstep(DECK.halfWidth + 0.4, DECK.halfWidth + 2, Math.abs(x)));
  const north = GLADE + landing;
  return north + (south - north) * smoothstep(-RILL.halfWidth, RILL.halfWidth, z - RILL.centreZ(x));
}

/**
 * The rill cut into `ground`, `distance` metres from its centre line: a parabolic bed meeting the
 * water line at its edges and a short bank up to the ground. `strength` fades it out past the
 * bowl's edge, where the rim rises over its ends.
 */
function cutRill(ground: number, distance: number, strength: number): number {
  if (strength <= 0 || distance >= RILL.halfWidth + RILL_BANK) {
    return ground;
  }
  const bed = RILL_BED * (1 - Math.min(1, (distance / RILL.halfWidth) ** 2));
  const cut =
    bed + (ground - bed) * smoothstep(RILL.halfWidth, RILL.halfWidth + RILL_BANK, distance);
  return ground + (Math.min(cut, ground) - ground) * strength;
}

/** The pool pressed into `ground`: a bowl `POOL_DEPTH` under the water, a bank round its ellipse. */
function pressPool(ground: number, x: number, z: number): number {
  const e = Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz);
  if (e >= 1.4) {
    return ground;
  }
  const bed = POOL.level - POOL_DEPTH * Math.max(0, 1 - e * e);
  return bed + (Math.max(ground, bed) - bed) * smoothstep(1, 1.4, e);
}

/** How far (x, z) is into the cave's floor, 0 … 1: soft at the mouth, hidden in rock at the sides. */
function caveShare(x: number, z: number): number {
  const half = (CAVE.x1 - CAVE.x0) / 2;
  const across = 1 - smoothstep(half, half + 0.3, Math.abs(x - (CAVE.x0 + CAVE.x1) / 2));
  if (across <= 0) {
    return 0;
  }
  const along =
    smoothstep(CAVE.z1 + 0.4, CAVE.z1 - 0.4, z) * (1 - smoothstep(CAVE.z0, CAVE.z0 - 0.3, z));
  return across * along;
}

/** A small, even ripple, at most 8 cm either way. */
function ripple(x: number, z: number): number {
  return (
    0.05 * Math.sin(x * 0.73 + 1.3) * Math.cos(z * 0.61 - 0.4) + 0.03 * Math.sin((x + z) * 1.7)
  );
}

/**
 * The Lichtung's ground: the section's heights along the axis, the rill carved across it, the pool
 * pressed in under the falls, the rock behind the cliff face and the rim rising all round beyond
 * the bowl, with the cave's floor cut into the rock and a ripple on the dry ground off the paths.
 */
export function jungleHeightAt(x: number, z: number): number {
  const beyond = beyondBowl(x, z);
  let height = sectionHeight(x, z);
  height = cutRill(height, distanceToRill(x, z), 1 - smoothstep(0, 2, beyond));
  height = pressPool(height, x, z);
  const behind =
    smoothstep(CLIFF.z - 1.5, CLIFF.z - 3.5, z) *
    (1 - smoothstep(CLIFF.width / 2 - 1, CLIFF.width / 2 + 2, Math.abs(x)));
  height += (Math.max(height, CLIFF_GROUND) - height) * behind;
  const rim = RIM.high + (RIM.low - RIM.high) * smoothstep(8, 20, z);
  height += rim * smoothstep(-0.5, 5, beyond);
  const cave = caveShare(x, z);
  height += (CAVE.floor - height) * cave;
  // The ripple stays off the paths, out of the water and out of the cave.
  const dry = smoothstep(-0.1, 0.25, height) * (1 - cave);
  if (dry > 0) {
    const offPath = smoothstep(1.4, 3, distanceToPaths(x, z));
    if (offPath > 0) {
      height += ripple(x, z) * offPath * dry;
    }
  }
  return height;
}

/** The feed cards beside the boardwalk, each turned to the walk 3 m back towards the portal. */
export const CARD_SLOTS: readonly Placed[] = Object.freeze(
  [pt(-9.2, 15.8), pt(-3.6, 12.2), pt(-10.6, 9), pt(-2.8, 8.4)].map((card) => {
    const target = pointAlong(BOARDWALK, nearestOnPath(card.x, card.z, BOARDWALK).along - 3);
    return placed(card.x, card.z, Math.atan2(target.x - card.x, target.z - card.z));
  }),
);

/** Metres over the ground the tags' cords hang from: the canopy line. */
const HANG = 6.2;

/** The four tags hung over the boardwalk, in `SLOP_TAGS` order; `y` is where each cord hangs from. */
export const TAG_SLOTS: readonly (Pt & { readonly y: number })[] = Object.freeze(
  [pt(-6.8, 13.8), pt(-8.2, 10.4), pt(-5.8, 6.6), pt(-1.8, 4.2)].map((tag) =>
    Object.freeze({ x: tag.x, z: tag.z, y: jungleHeightAt(tag.x, tag.z) + HANG }),
  ),
);

/** The fourteen vines of the prototype's `VINES`; `r` is how far their tendrils reach. */
export const VINE_SLOTS: readonly (Pt & { readonly r: number })[] = Object.freeze(
  (
    [
      [284, 410, 8],
      [256, 388, 9],
      [238, 368, 8],
      [252, 348, 10],
      [236, 330, 8],
      [262, 314, 9],
      [288, 300, 8],
      [306, 272, 8],
      [320, 200, 9],
      [304, 168, 8],
      [340, 172, 8],
      [372, 128, 7],
      [420, 90, 7],
      [296, 96, 8],
    ] as const
  ).map(([px, py, r]) => Object.freeze({ x: (px - 320) / 10, z: (py - 240) / 10, r: r / 10 })),
);

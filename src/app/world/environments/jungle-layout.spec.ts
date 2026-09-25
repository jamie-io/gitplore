import {
  ARCH,
  BAMBOO,
  BEHIND_FALLS,
  BOARDWALK,
  BOWL,
  CARD_SLOTS,
  CAVE,
  CLIFF,
  DECK,
  EXHIBIT,
  LANTERN_POST,
  NORTH_LOOP,
  PATHS,
  POOL,
  PORTAL,
  Pt,
  RILL,
  STATION_STANDS,
  STEPS,
  STELE,
  TAG_SLOTS,
  TOUR,
  VINE_SLOTS,
  WALL,
  WALL_SPUR,
  WATERFALL,
  crossesArch,
  distanceToPaths,
  glidePath,
  inBowl,
  jungleHeightAt,
  nearestOnPath,
  pathLength,
  stepCentres,
  underArch,
} from './jungle-layout';
import { PLAYER_RADIUS } from '@engine/player/player-controller';
import { JungleCave } from './jungle-cave';
import { DSCHUNGEL } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';
import { clearance } from './testing/clearance';

/** The rock the walk passes into the cave by: the cliff's colliders either side of its mouth. */
const ROCK = new JungleCave({ shared: new SharedUniforms(DSCHUNGEL) }).colliders;
/** The feed wall's footprint: 5.6 m wide and 0.5 m deep round its centre, facing south. */
const WALL_FOOTPRINT = {
  kind: 'aabb' as const,
  minX: WALL.x - 2.8,
  maxX: WALL.x + 2.8,
  minZ: WALL.z - 0.25,
  maxZ: WALL.z + 0.25,
};
/**
 * The exhibit's footprint: the screen's body (3.4 m wide, with the landmark's own margin) and the
 * easel round it, widened to 1.06, its uprights and its back legs, whose feet stand 1.35 m behind.
 */
const EASEL_FOOTPRINT = {
  kind: 'aabb' as const,
  minX: EXHIBIT.x - 2.25,
  maxX: EXHIBIT.x + 2.25,
  minZ: EXHIBIT.z - 1.55,
  maxZ: EXHIBIT.z + 0.48,
};
const OBSTACLES = [...ROCK, WALL_FOOTPRINT, EASEL_FOOTPRINT];
/** The pool's edge, as points round its ellipse. */
const POOL_EDGE = Array.from({ length: 720 }, (_, i) => {
  const angle = (i / 720) * Math.PI * 2;
  return { x: POOL.x + POOL.rx * Math.cos(angle), z: POOL.z + POOL.rz * Math.sin(angle) };
});

/** Metres from (x, z) to the pool's edge; negative inside the water. */
function poolClearance(x: number, z: number): number {
  const edge = Math.min(...POOL_EDGE.map((p) => Math.hypot(x - p.x, z - p.z)));
  return Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz) < 1 ? -edge : edge;
}

/**
 * The least room along a polyline, sampled every 5 cm of every segment, between it and the cave's
 * rock, the pool's edge and the feed wall.
 */
function worstClearance(points: readonly Pt[]): { room: number; at: string } {
  let worst = { room: Infinity, at: 'nowhere' };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05));
    for (let k = 0; k <= samples; k++) {
      const x = a.x + ((b.x - a.x) * k) / samples;
      const z = a.z + ((b.z - a.z) * k) / samples;
      const room = Math.min(clearance(x, z, OBSTACLES), poolClearance(x, z));
      if (room < worst.room) {
        worst = { room, at: `${x.toFixed(2)}, ${z.toFixed(2)}` };
      }
    }
  }
  return worst;
}

/** The walked lines as a graph: every vertex, keyed by its coordinates, with its neighbours. */
function pathGraph(): Map<string, { point: Pt; next: Set<string> }> {
  const key = (point: Pt) => `${point.x.toFixed(3)},${point.z.toFixed(3)}`;
  const graph = new Map<string, { point: Pt; next: Set<string> }>();
  const vertex = (point: Pt) => {
    const at = key(point);
    if (!graph.has(at)) {
      graph.set(at, { point, next: new Set() });
    }
    return at;
  };
  for (const path of PATHS) {
    for (let i = 1; i < path.length; i++) {
      const a = vertex(path[i - 1]);
      const b = vertex(path[i]);
      graph.get(a)!.next.add(b);
      graph.get(b)!.next.add(a);
    }
  }
  return graph;
}

describe('jungle layout', () => {
  it('fits the bowl inside 60 × 45 m', () => {
    expect(BOWL.rx * 2).toBeLessThanOrEqual(60);
    expect(BOWL.rz * 2).toBeLessThanOrEqual(45);
  });

  // K6 asks for 60 m and 14 m; routing round the feed wall's west end, the pool and the cave's
  // jambs with a body's width to spare takes a little more, so the controller relaxed the tour to
  // 62 m and the stations' spacing to 16 m.
  it('keeps the tour at most 62 m and stations 3–16 m apart', () => {
    const stops = [PORTAL, ...TOUR.map((id) => STATION_STANDS[id])];
    let total = 0;
    for (let i = 1; i < stops.length; i++) {
      const leg = pathLength(glidePath(stops[i - 1], stops[i]));
      if (i > 1) {
        expect(leg, `leg to ${TOUR[i - 1]}`).toBeGreaterThanOrEqual(3);
        expect(leg, `leg to ${TOUR[i - 1]}`).toBeLessThanOrEqual(16);
      }
      total += leg;
    }
    expect(total).toBeLessThanOrEqual(62);
  });

  it('looks from the portal through the arch at the exhibit', () => {
    expect(crossesArch(PORTAL, EXHIBIT)).toBe(true);
  });

  it('follows the section heights', () => {
    expect(jungleHeightAt(0, 20)).toBeCloseTo(3.0, 1);
    expect(jungleHeightAt(-7, 11.6)).toBeCloseTo(0.3, 1);
    expect(jungleHeightAt(0, -8)).toBeCloseTo(1.0, 1);
    expect(jungleHeightAt(0, RILL.centreZ(0))).toBeCloseTo(-0.8, 1);
    expect(stepCentres()[0].y).toBeGreaterThan(0.8);
    expect(stepCentres()[10].y).toBeCloseTo(2.4, 2);
  });

  it('rises into a rim outside the bowl', () => {
    expect(jungleHeightAt(BOWL.rx + 4, 0)).toBeGreaterThan(8);
    expect(jungleHeightAt(0, -BOWL.rz - 4)).toBeGreaterThan(8);
    expect(jungleHeightAt(-BOWL.rx - 4, 0)).toBeGreaterThan(8);
  });

  it('detects a glide segment that jumps over the arch trigger', () => {
    expect(crossesArch({ x: 0, z: 3 }, { x: 0, z: -3 })).toBe(true);
    expect(crossesArch({ x: 5, z: 3 }, { x: 5, z: -3 })).toBe(false);
    // Diagonally through a corner, along an edge's outside, ending inside, and short of it.
    expect(crossesArch({ x: -3, z: 2 }, { x: 1, z: -2 })).toBe(true);
    expect(crossesArch({ x: -3, z: 0.9 }, { x: 3, z: 0.9 })).toBe(false);
    expect(crossesArch({ x: 0, z: 5 }, { x: 0.2, z: 0.1 })).toBe(true);
    expect(crossesArch({ x: 0, z: 5 }, { x: 0, z: 1 })).toBe(false);
    expect(crossesArch({ x: 0, z: 0 }, { x: 0, z: 0 })).toBe(true);
    expect(crossesArch({ x: 3, z: 3 }, { x: 3, z: 3 })).toBe(false);
  });

  it('routes to the cave behind the waterfall', () => {
    const path = glidePath(STATION_STANDS.exponat, STATION_STANDS.hoehle);
    expect(path.some((p) => p.z < -18.2 && p.z > -21 && Math.abs(p.x) > 1.2)).toBe(true);
    for (const p of path) {
      expect(Math.hypot((p.x - POOL.x) / POOL.rx, (p.z - POOL.z) / POOL.rz)).toBeGreaterThan(1);
    }
    // Along every segment, not only at its ends: a body's width off the pool and the rock.
    const worst = worstClearance(path);
    expect(worst.room, worst.at).toBeGreaterThanOrEqual(PLAYER_RADIUS);
  });

  it('keeps every walked line a body’s width off the cave’s jambs, the pool and the feed wall', () => {
    for (const path of PATHS) {
      const worst = worstClearance(path);
      expect(worst.room, worst.at).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    }
  });

  it('glides between consecutive stops a body’s width off the jambs, the pool and the wall', () => {
    const stops = [PORTAL, ...TOUR.map((id) => STATION_STANDS[id])];
    for (let i = 1; i < stops.length; i++) {
      const worst = worstClearance(glidePath(stops[i - 1], stops[i]));
      expect(worst.room, `to ${TOUR[i - 1]}: ${worst.at}`).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    }
  });

  it('has no dead end longer than 15 m', () => {
    // The boardwalk's start is the arrival itself, not a side path; the spur to the feed wall is
    // the one side path, and ends at station 6.
    const graph = pathGraph();
    const ends = [...graph.values()]
      .filter(({ next }) => next.size === 1)
      .map(({ point }) => point);
    expect(ends).toEqual([PORTAL, WALL_SPUR[1]]);
    expect(WALL_SPUR[1]).toEqual({ x: STATION_STANDS.wand.x, z: STATION_STANDS.wand.z });

    const junctions = [...graph.values()]
      .filter(({ next }) => next.size >= 3)
      .map(({ point }) => point);
    for (const end of ends.filter((point) => point !== PORTAL)) {
      const nearest = Math.min(...junctions.map((point) => pathLength(glidePath(end, point))));
      expect(nearest, `${end.x}, ${end.z}`).toBeLessThanOrEqual(15);
    }
  });

  it('lays the walked lines out as the prototype draws them', () => {
    expect(BOARDWALK[0]).toBe(PORTAL);
    expect(BOARDWALK[BOARDWALK.length - 1]).toBe(STEPS.from);
    expect(NORTH_LOOP[0]).toBe(ARCH);
    // The loop closes at a junction in front of the exhibit, on the way from the arch, and forks
    // round the easel rather than through it; the exhibit's stand is on the way up to it.
    const junction = NORTH_LOOP[NORTH_LOOP.length - 1];
    expect(NORTH_LOOP[1]).toBe(junction);
    expect(junction.x).toBe(EXHIBIT.x);
    expect(junction.z).toBeLessThan(STATION_STANDS.exponat.z);
    expect(junction.z).toBeGreaterThan(EXHIBIT.z + 0.48 + PLAYER_RADIUS);
    expect(worstClearance(NORTH_LOOP).room).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(PATHS).toContain(BOARDWALK);
    expect(PATHS).toContain(NORTH_LOOP);
    expect(PATHS).toContain(WALL_SPUR);
    // The steps land on the deck's south end, the deck ends at the arch.
    expect(STEPS.to).toEqual({ x: 0, z: 2.2 });
    expect(pathLength([STEPS.from, STEPS.to])).toBeCloseTo(4.8, 1);
  });

  it('keeps everything walkable inside the bowl, and the portal just inside its south edge', () => {
    for (const path of PATHS) {
      for (const point of path) {
        expect(inBowl(point.x, point.z), `${point.x}, ${point.z}`).toBe(true);
      }
    }
    for (const id of TOUR.filter((id) => id !== 'hoehle')) {
      expect(inBowl(STATION_STANDS[id].x, STATION_STANDS[id].z), id).toBe(true);
    }
    expect(inBowl(PORTAL.x, PORTAL.z)).toBe(true);
    expect(inBowl(PORTAL.x, PORTAL.z + 1)).toBe(false);
  });

  it('puts the stations on or beside the walked lines', () => {
    for (const id of TOUR) {
      const stand = STATION_STANDS[id];
      expect(distanceToPaths(stand.x, stand.z), id).toBeLessThan(1.1);
    }
  });

  it('installs only between the arch’s pillars, on the deck', () => {
    expect(underArch(ARCH.x, ARCH.z)).toBe(true);
    expect(underArch(1.3, 0.7)).toBe(true);
    expect(underArch(1.5, 0)).toBe(false);
    expect(underArch(0, 0.9)).toBe(false);
    expect(underArch(0, -0.9)).toBe(false);
  });

  it('carves the rill below the water line across the bowl, and stands the deck over it', () => {
    for (let x = -26; x <= 26; x += 2) {
      const centre = RILL.centreZ(x);
      expect(jungleHeightAt(x, centre), `bed at ${x}`).toBeLessThan(-0.6);
      expect(jungleHeightAt(x, centre + RILL.halfWidth * 0.7)).toBeLessThan(0);
      expect(jungleHeightAt(x, centre - RILL.halfWidth * 0.7)).toBeLessThan(0);
      // Where a visitor may stand beside it, the ground is out of the water.
      expect(jungleHeightAt(x, centre + RILL.halfWidth + 0.6)).toBeGreaterThan(0.15);
      expect(jungleHeightAt(x, centre - RILL.halfWidth - 0.6)).toBeGreaterThan(0.15);
    }
    // The deck spans the whole rill and a little of each bank.
    expect(DECK.halfLength).toBeGreaterThan(RILL.halfWidth + 0.5);
    expect(DECK.halfWidth * 2).toBeCloseTo(2.9, 5);
  });

  it('meets the deck’s north end with a ramp down to the glade', () => {
    const end = jungleHeightAt(0, -DECK.halfLength - 0.05);
    expect(DECK.height - end).toBeGreaterThan(0);
    expect(DECK.height - end).toBeLessThan(0.45);
    // Down the ramp, never steeper than a step per 30 cm.
    for (let z = -DECK.halfLength; z > -4; z -= 0.3) {
      expect(jungleHeightAt(0, z) - jungleHeightAt(0, z - 0.3), `at ${z}`).toBeLessThan(0.45);
    }
  });

  it('holds the pool’s water in a dip under the falls', () => {
    expect(jungleHeightAt(POOL.x, POOL.z)).toBeLessThan(POOL.level - 0.5);
    expect(jungleHeightAt(POOL.x + POOL.rx * 0.6, POOL.z)).toBeLessThan(POOL.level);
    expect(jungleHeightAt(POOL.x + POOL.rx * 1.6, POOL.z)).toBeGreaterThan(POOL.level);
    expect(WATERFALL.bottom).toBe(POOL.level);
    expect(WATERFALL.top - WATERFALL.bottom).toBeGreaterThan(8);
    expect(WATERFALL.x1 - WATERFALL.x0).toBeCloseTo(2, 5);
  });

  it('floors the cave at its own height inside the cliff', () => {
    expect(jungleHeightAt(0, -21.6)).toBeCloseTo(CAVE.floor, 2);
    expect(jungleHeightAt(0, (CAVE.z0 + CAVE.z1) / 2)).toBeCloseTo(CAVE.floor, 2);
    expect(STELE.z).toBeGreaterThan(CAVE.z0);
    expect(STELE.z).toBeLessThan(CAVE.z1);
    expect(CAVE.z1).toBe(CLIFF.z);
    // Behind the rock face on either side of the cave, the ground is the cliff's.
    expect(jungleHeightAt(-6, -24)).toBeGreaterThan(CLIFF.height);
  });

  it('keeps the walk behind the falls between the pool and the cave', () => {
    expect(BEHIND_FALLS.x0).toBeLessThan(WATERFALL.x0);
    expect(BEHIND_FALLS.x1).toBeGreaterThan(WATERFALL.x1);
    // The cave counts too, back to its end wall, so walking out of it is not a new arrival.
    expect(BEHIND_FALLS.z0).toBe(CAVE.z0);
    const path = glidePath(STATION_STANDS.wand, STATION_STANDS.hoehle);
    expect(path).toContainEqual({ x: 2.4, z: -19.2 });
  });

  it('ripples the ground by at most 8 cm, and not at all on the paths', () => {
    let rippled = 0;
    // Off the paths, on the marsh and the glade.
    for (let x = -16; x <= 16; x += 0.9) {
      for (const [z, flat] of [
        [8, 0.3],
        [-7, 1],
      ] as const) {
        if (distanceToPaths(x, z) > 3) {
          const off = Math.abs(jungleHeightAt(x, z) - flat);
          expect(off, `${x}, ${z}`).toBeLessThanOrEqual(0.08);
          rippled = Math.max(rippled, off);
        }
      }
    }
    expect(rippled).toBeGreaterThan(0.01);
    expect(jungleHeightAt(-7, 11.6)).toBeCloseTo(0.3, 10);
    expect(jungleHeightAt(0, -8)).toBeCloseTo(1, 10);
  });

  it('turns every feed card towards the boardwalk, beside it but off it', () => {
    expect(CARD_SLOTS).toHaveLength(4);
    for (const card of CARD_SLOTS) {
      const near = nearestOnPath(card.x, card.z, BOARDWALK);
      expect(near.distance).toBeGreaterThan(1.4);
      expect(near.distance).toBeLessThan(4);
      const dx = near.x - card.x;
      const dz = near.z - card.z;
      expect(Math.sin(card.yaw) * dx + Math.cos(card.yaw) * dz).toBeGreaterThan(0);
    }
  });

  it('hangs four tags and fourteen vines over the walk, from the canopy line', () => {
    expect(TAG_SLOTS).toHaveLength(4);
    expect(VINE_SLOTS).toHaveLength(14);
    for (const tag of TAG_SLOTS) {
      expect(tag.y - jungleHeightAt(tag.x, tag.z)).toBeGreaterThan(5);
      expect(distanceToPaths(tag.x, tag.z)).toBeLessThan(1.5);
    }
    expect(VINE_SLOTS[0]).toEqual({ x: -3.6, z: 17, r: 0.8 });
    expect(VINE_SLOTS[13]).toEqual({ x: -2.4, z: -14.4, r: 0.8 });
  });

  it('stands the bamboo at the deck’s four corners, the lantern on the ledge and the wall north', () => {
    expect(BAMBOO).toHaveLength(4);
    for (const stalk of BAMBOO) {
      expect(Math.abs(stalk.x)).toBeGreaterThan(DECK.halfWidth);
      expect(Math.abs(stalk.z)).toBeLessThanOrEqual(DECK.halfLength);
    }
    expect(jungleHeightAt(LANTERN_POST.x, LANTERN_POST.z)).toBeCloseTo(3, 1);
    // Off the walk by the post's radius and a body's width, west of the laterne stand.
    expect(distanceToPaths(LANTERN_POST.x, LANTERN_POST.z)).toBeGreaterThan(0.14 + PLAYER_RADIUS);
    expect(LANTERN_POST.x).toBeLessThan(STATION_STANDS.laterne.x);
    expect(WALL.z).toBeLessThan(STATION_STANDS.wand.z);
  });
});

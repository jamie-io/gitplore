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

  it('keeps the tour at most 60 m and stations 3–14 m apart', () => {
    const stops = [PORTAL, ...TOUR.map((id) => STATION_STANDS[id])];
    let total = 0;
    for (let i = 1; i < stops.length; i++) {
      const leg = pathLength(glidePath(stops[i - 1], stops[i]));
      if (i > 1) {
        expect(leg, `leg to ${TOUR[i - 1]}`).toBeGreaterThanOrEqual(3);
        expect(leg, `leg to ${TOUR[i - 1]}`).toBeLessThanOrEqual(14);
      }
      total += leg;
    }
    expect(total).toBeLessThanOrEqual(60);
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
  });

  it('routes to the cave behind the waterfall', () => {
    const path = glidePath(STATION_STANDS.exponat, STATION_STANDS.hoehle);
    expect(path.some((p) => p.z < -18.2 && p.z > -21 && Math.abs(p.x) > 1.2)).toBe(true);
    for (const p of path) {
      expect(Math.hypot((p.x - POOL.x) / POOL.rx, (p.z - POOL.z) / POOL.rz)).toBeGreaterThan(1);
    }
  });

  it('has no dead end longer than 15 m', () => {
    // The only line that ends without joining another is the boardwalk's start: the arrival
    // itself, not a side path. Every other end meets the rest of the network.
    const graph = pathGraph();
    const ends = [...graph.values()]
      .filter(({ next }) => next.size === 1)
      .map(({ point }) => point);
    expect(ends).toEqual([PORTAL]);

    for (const end of ends.filter((point) => point !== PORTAL)) {
      const junction = [...graph.values()].filter(({ next }) => next.size >= 3);
      const nearest = Math.min(...junction.map(({ point }) => pathLength(glidePath(end, point))));
      expect(nearest).toBeLessThanOrEqual(15);
    }
  });

  it('lays the walked lines out as the prototype draws them', () => {
    expect(BOARDWALK[0]).toBe(PORTAL);
    expect(BOARDWALK[BOARDWALK.length - 1]).toBe(STEPS.from);
    expect(NORTH_LOOP[0]).toBe(ARCH);
    expect(NORTH_LOOP[NORTH_LOOP.length - 1]).toEqual({ x: 0, z: -9 });
    expect(PATHS).toContain(BOARDWALK);
    expect(PATHS).toContain(NORTH_LOOP);
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
    expect(WALL.z).toBeLessThan(STATION_STANDS.wand.z);
  });
});

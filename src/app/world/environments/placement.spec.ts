import {
  arcAnchors,
  FRONT_ARC,
  MIN_LANDMARK_SEPARATION,
  PORTAL_HALF_WIDTH,
  VISIBILITY_MARGIN,
  ringPlacements,
  OUTER_RING_RADIUS,
  RING_RADIUS,
} from './placement';

describe('ringPlacements', () => {
  it('returns exactly as many spots as asked for', () => {
    expect(ringPlacements(0).length).toBe(0);
    expect(ringPlacements(9).length).toBe(9);
  });

  it('alternates near and far radii along the bearing order', () => {
    const spots = [...ringPlacements(9)].sort(
      (a, b) =>
        Math.atan2(a.position[0], -a.position[2]) - Math.atan2(b.position[0], -b.position[2]),
    );

    spots.forEach(({ position }, index) => {
      expect(Math.hypot(position[0], position[2])).toBeCloseTo(
        index % 2 === 0 ? RING_RADIUS : OUTER_RING_RADIUS,
        5,
      );
    });
  });

  it('keeps every spot within the front arc around the spawn', () => {
    for (const { position } of ringPlacements(9)) {
      expect(position[2]).toBeLessThan(0);
      expect(Math.abs(Math.atan2(position[0], -position[2]))).toBeLessThanOrEqual(FRONT_ARC / 2);
    }
  });

  it('turns every spot to face the spawn, so a visitor meets its front', () => {
    for (const { position, rotationY } of ringPlacements(5)) {
      const front = [Math.sin(rotationY), Math.cos(rotationY)];
      const radius = Math.hypot(position[0], position[2]);
      const towardsSpawn = [-position[0] / radius, -position[2] / radius];

      expect(front[0]).toBeCloseTo(towardsSpawn[0], 5);
      expect(front[1]).toBeCloseTo(towardsSpawn[1], 5);
    }
  });

  it('is deterministic, so a rebuild puts everything back where it was', () => {
    expect(ringPlacements(4)).toEqual(ringPlacements(4));
  });

  it('selects spots from the arc centre outward', () => {
    const angles = ringPlacements(5).map(({ position }) => Math.atan2(position[0], -position[2]));

    expect(angles[0]).toBeCloseTo(0, 5);
    for (let index = 1; index < angles.length; index++) {
      expect(Math.abs(angles[index]) + 1e-10).toBeGreaterThanOrEqual(Math.abs(angles[index - 1]));
    }
    expect(Math.abs(angles.at(-1)!)).toBeLessThanOrEqual(FRONT_ARC / 2);
  });

  it('keeps spots apart, so two landmarks never overlap', () => {
    const spots = ringPlacements(6).map(({ position }) => position);

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const distance = Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
        expect(distance).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
      }
    }
  });

  describe('avoiding pinned landmarks', () => {
    /** The spot `ringPlacements(1)` would otherwise take: straight ahead of the spawn. */
    const AHEAD = [0, 0, -RING_RADIUS] as const;

    const distanceTo = (spot: readonly [number, number, number], other: readonly number[]) =>
      Math.hypot(spot[0] - other[0], spot[2] - other[2]);

    it('leaves a spot that would stand on top of a pinned landmark empty', () => {
      const pinned = [0, 0, -20] as const;

      for (const { position } of ringPlacements(2, [pinned])) {
        expect(distanceTo(position, pinned)).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
      }
    });

    it('still returns every spot it was asked for after skipping', () => {
      expect(ringPlacements(2, [AHEAD]).length).toBe(2);
      expect(ringPlacements(4, [AHEAD]).length).toBe(4);
    });

    it('keeps the remaining spots apart from each other', () => {
      const spots = ringPlacements(4, [AHEAD]).map(({ position }) => position);

      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(distanceTo(spots[i], spots[j])).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
        }
      }
    });

    it('leaves impossible slots unplaced instead of stacking them', () => {
      const everywhere = ringPlacements(9).map(({ position }) => position);

      expect(ringPlacements(3, everywhere)).toEqual([]);
    });

    it('does not stack fallback placements on the three pinned portfolio landmarks', () => {
      const pinned = [
        [-10, 0, -20],
        [0, 0, -20],
        [10, 0, -20],
      ] as const;
      const generated = ringPlacements(6, pinned);
      const placed = [...pinned, ...generated.map(({ position }) => position)];

      expect(generated).toHaveLength(6);
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          expect(
            Math.hypot(placed[i][0] - placed[j][0], placed[i][2] - placed[j][2]),
          ).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
        }
      }
    });

    it('rejects a slot just below its visibility bearing requirement', () => {
      const requiredGap = Math.atan(PORTAL_HALF_WIDTH / RING_RADIUS) + VISIBILITY_MARGIN;
      const pinnedBearing = requiredGap - 5e-13;
      const pinned = [
        Math.sin(pinnedBearing) * OUTER_RING_RADIUS,
        0,
        -Math.cos(pinnedBearing) * OUTER_RING_RADIUS,
      ] as const;
      const [spot] = ringPlacements(1, [pinned]);
      const spotRadius = Math.hypot(spot.position[0], spot.position[2]);
      const spotBearing = Math.atan2(spot.position[0], -spot.position[2]);
      const minimumGap =
        Math.max(
          Math.atan(PORTAL_HALF_WIDTH / spotRadius),
          Math.atan(PORTAL_HALF_WIDTH / OUTER_RING_RADIUS),
        ) + VISIBILITY_MARGIN;

      expect(Math.abs(spotBearing - pinnedBearing)).toBeGreaterThanOrEqual(minimumGap);
    });

    it('is unchanged when nothing is pinned near the ring', () => {
      expect(ringPlacements(3, [[0, 0, 0]])).toEqual(ringPlacements(3));
    });
  });
});

describe('arcAnchors', () => {
  const RADIUS = 19;

  it('turns every spot to face the spawn, so a visitor meets its front', () => {
    for (const { position, rotationY } of arcAnchors(4, [], RADIUS, Math.PI * 0.9)) {
      const front = [Math.sin(rotationY), Math.cos(rotationY)];
      const towardsSpawn = [-position[0] / RADIUS, -position[2] / RADIUS];

      expect(front[0]).toBeCloseTo(towardsSpawn[0], 5);
      expect(front[1]).toBeCloseTo(towardsSpawn[1], 5);
    }
  });
});

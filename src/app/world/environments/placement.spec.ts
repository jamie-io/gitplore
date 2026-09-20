import {
  arcAnchors,
  FRONT_ARC,
  MIN_LANDMARK_SEPARATION,
  ringPlacements,
  RING_RADIUS,
} from './placement';

describe('ringPlacements', () => {
  it('returns exactly as many spots as asked for', () => {
    expect(ringPlacements(0).length).toBe(0);
    expect(ringPlacements(7).length).toBe(7);
  });

  it('puts every spot on the ring around the spawn', () => {
    for (const { position } of ringPlacements(5)) {
      expect(Math.hypot(position[0], position[2])).toBeCloseTo(RING_RADIUS, 5);
    }
  });

  it('turns every spot to face the spawn, so a visitor meets its front', () => {
    for (const { position, rotationY } of ringPlacements(5)) {
      const front = [Math.sin(rotationY), Math.cos(rotationY)];
      const towardsSpawn = [-position[0] / RING_RADIUS, -position[2] / RING_RADIUS];

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
      expect(Math.abs(angles[index])).toBeGreaterThanOrEqual(Math.abs(angles[index - 1]));
    }
    expect(Math.abs(angles.at(-1)!)).toBeCloseTo(FRONT_ARC / 2, 5);
  });

  it('keeps spots apart, so two landmarks never overlap', () => {
    const spots = ringPlacements(6).map(({ position }) => position);

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const distance = Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
        expect(distance).toBeGreaterThan(6);
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

    it('places everything anyway when no spot on the ring is clear', () => {
      // Pinning a landmark at every usable slot leaves nowhere to go; dropping a project from the
      // world would be worse than a tight fit, so the plain ring stands in.
      const everywhere = ringPlacements(15).map(({ position }) => position);

      expect(ringPlacements(3, everywhere)).toEqual(ringPlacements(3));
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

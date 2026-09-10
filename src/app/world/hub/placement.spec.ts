import { ringPlacements, RING_RADIUS } from './placement';

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

  it('keeps spots apart, so two landmarks never overlap', () => {
    const spots = ringPlacements(6).map(({ position }) => position);

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const distance = Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
        expect(distance).toBeGreaterThan(6);
      }
    }
  });
});

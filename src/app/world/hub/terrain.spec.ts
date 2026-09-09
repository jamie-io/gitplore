import { TERRAIN_FLAT_RADIUS, TERRAIN_MAX_HEIGHT, terrainHeightAt } from './terrain';

describe('terrainHeightAt', () => {
  it('returns the same height for the same point', () => {
    expect(terrainHeightAt(31.5, -12.25)).toBe(terrainHeightAt(31.5, -12.25));
  });

  it('is perfectly flat around the spawn so landmarks sit level', () => {
    expect(terrainHeightAt(0, 0)).toBe(0);
    expect(terrainHeightAt(TERRAIN_FLAT_RADIUS - 0.5, 0)).toBe(0);
    expect(terrainHeightAt(0, -TERRAIN_FLAT_RADIUS + 0.5)).toBe(0);
  });

  it('has relief once you leave the flat centre', () => {
    const samples = [];
    for (let x = -100; x <= 100; x += 7) samples.push(terrainHeightAt(x, x * 0.7));

    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
  });

  it('stays within the advertised height range', () => {
    for (let x = -120; x <= 120; x += 3) {
      for (let z = -120; z <= 120; z += 3) {
        expect(Math.abs(terrainHeightAt(x, z))).toBeLessThanOrEqual(TERRAIN_MAX_HEIGHT);
      }
    }
  });

  it('is continuous, so the player never hits a cliff edge', () => {
    for (let x = -60; x <= 60; x += 1.5) {
      const step = Math.abs(terrainHeightAt(x + 0.1, 20) - terrainHeightAt(x, 20));
      expect(step).toBeLessThan(0.25);
    }
  });
});

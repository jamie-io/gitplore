import { basinLevel, pressBasin } from './basin';

const relief = (x: number, z: number) => Math.sin(x * 0.1) + Math.cos(z * 0.13);
const basin = { x: 10, z: -5, radius: 4, depth: 1 };

describe('basins', () => {
  const level = basinLevel(relief, basin);

  it('sets the water line below all of the rim', () => {
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      const x = basin.x + Math.sin(angle) * basin.radius;
      const z = basin.z + Math.cos(angle) * basin.radius;
      expect(relief(x, z)).toBeGreaterThan(level);
    }
  });

  it('presses a bowl of the given depth below the water line', () => {
    expect(pressBasin(relief, basin, level, basin.x, basin.z)).toBeCloseTo(level - basin.depth, 9);
  });

  it('leaves the ground untouched beyond 1.3 radii', () => {
    expect(pressBasin(relief, basin, level, basin.x + basin.radius * 1.31, basin.z)).toBe(
      relief(basin.x + basin.radius * 1.31, basin.z),
    );
  });
});

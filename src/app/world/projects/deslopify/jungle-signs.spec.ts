import { clearance } from '../../environments/testing/clearance';
import { EXAMPLE_VIDEOS } from './video-wall';
import { JungleSigns } from './jungle-signs';

describe('JungleSigns', () => {
  it('uses every exported example pair without copying its data', () => {
    const signs = new JungleSigns();

    expect(signs.pairCount).toBe(EXAMPLE_VIDEOS.length);
    expect(signs.positions).toHaveLength(EXAMPLE_VIDEOS.length);
    expect(signs.positions.every(({ x }) => Math.abs(x) - 1.4 > 4)).toBe(true);
    expect(new Set(signs.positions.map(({ x, z }) => `${x}:${z}`)).size).toBe(
      EXAMPLE_VIDEOS.length,
    );
  });

  it('blocks the visitor at every board, with one fixed collider per sign', () => {
    const signs = new JungleSigns();

    expect(signs.colliders).toHaveLength(EXAMPLE_VIDEOS.length);
    signs.positions.forEach(({ x, z }, index) => {
      expect(clearance(x, z, [signs.colliders[index]])).toBeLessThan(0);
    });
  });
});

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
});

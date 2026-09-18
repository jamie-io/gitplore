import { BufferGeometry } from 'three';
import {
  birchTree,
  boulder,
  broadleafTree,
  bush,
  flowerTuft,
  lilyPad,
  pineTree,
  reeds,
} from './flora';

/** Where each prop's lowest and highest vertex may fall, in metres at scale 1. */
const CASES: readonly {
  name: string;
  build: (seed: number) => BufferGeometry;
  base: readonly [number, number];
  top: readonly [number, number];
}[] = [
  { name: 'broadleafTree', build: broadleafTree, base: [-0.05, 0.05], top: [4.5, 6.8] },
  { name: 'birchTree', build: birchTree, base: [-0.05, 0.05], top: [5.5, 7.2] },
  { name: 'pineTree', build: pineTree, base: [-0.01, 0.01], top: [4.8, 6.0] },
  { name: 'bush', build: bush, base: [-0.4, 0], top: [0.8, 1.4] },
  { name: 'boulder', build: boulder, base: [-0.7, -0.15], top: [0.75, 1.25] },
  {
    name: 'flowerTuft',
    build: (seed) => flowerTuft(seed, 0xffffff),
    base: [-0.01, 0.01],
    top: [0.3, 0.55],
  },
  { name: 'reeds', build: reeds, base: [-0.03, 0.01], top: [1.0, 1.9] },
  { name: 'lilyPad', build: lilyPad, base: [-0.01, 0.01], top: [0.015, 0.13] },
];

describe.each(CASES)('$name', ({ build, base, top }) => {
  it('is faceted and vertex-coloured: non-indexed, a normal and colour per vertex, no uvs', () => {
    const geometry = build(1);

    expect(geometry.index).toBeNull();
    const count = geometry.getAttribute('position').count;
    expect(count % 3).toBe(0);
    expect(geometry.getAttribute('normal').count).toBe(count);
    expect(geometry.getAttribute('color').count).toBe(count);
    expect(geometry.getAttribute('uv')).toBeUndefined();
  });

  it('stands on the ground at a believable size', () => {
    for (const seed of [1, 2, 3]) {
      const geometry = build(seed);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;

      expect(box?.min.y).toBeGreaterThanOrEqual(base[0]);
      expect(box?.min.y).toBeLessThanOrEqual(base[1]);
      expect(box?.max.y).toBeGreaterThanOrEqual(top[0]);
      expect(box?.max.y).toBeLessThanOrEqual(top[1]);
    }
  });

  it('is the same for the same seed and differs between seeds', () => {
    const a = Array.from(build(4).getAttribute('position').array);
    const b = Array.from(build(4).getAttribute('position').array);
    const c = Array.from(build(5).getAttribute('position').array);

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

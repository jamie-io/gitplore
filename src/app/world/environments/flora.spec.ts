import { BufferGeometry, Vector3 } from 'three';
import {
  bigLeafPlant,
  birchTree,
  boulder,
  broadleafTree,
  bush,
  cliffWall,
  flowerTuft,
  groundFern,
  kapokTree,
  leafCluster,
  lilyPad,
  liana,
  mossyBoulder,
  palmTree,
  pineTree,
  reeds,
  treeFern,
  CLIFF_LIP,
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
  { name: 'kapokTree', build: kapokTree, base: [-0.08, 0.08], top: [13.5, 17.5] },
  { name: 'palmTree', build: palmTree, base: [-0.01, 0.01], top: [6.4, 7.9] },
  { name: 'treeFern', build: treeFern, base: [-0.02, 0.01], top: [2.9, 4.1] },
  { name: 'bigLeafPlant', build: bigLeafPlant, base: [-0.02, 0.01], top: [1.2, 2.3] },
  { name: 'groundFern', build: groundFern, base: [-0.06, 0.01], top: [0.35, 0.75] },
  { name: 'mossyBoulder', build: mossyBoulder, base: [-0.7, -0.15], top: [0.95, 1.4] },
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

describe('liana', () => {
  it('hangs down from its origin, which is where it is tied to a branch', () => {
    const geometry = liana(1);
    geometry.computeBoundingBox();

    expect(geometry.boundingBox?.max.y).toBeLessThanOrEqual(0.2);
    expect(geometry.boundingBox?.min.y).toBeGreaterThanOrEqual(-7.5);
    expect(geometry.boundingBox?.min.y).toBeLessThanOrEqual(-4);
  });
});

describe('cliffWall', () => {
  const notch = { x: 9, width: 6 };
  const cliff = cliffWall(1, 60, 16, notch);
  const position = cliff.getAttribute('position');

  it('spans the width it was asked for', () => {
    cliff.computeBoundingBox();
    expect(cliff.boundingBox?.min.x).toBeLessThanOrEqual(-29);
    expect(cliff.boundingBox?.max.x).toBeGreaterThanOrEqual(29);
    expect(cliff.boundingBox?.max.y).toBeLessThanOrEqual(16 + 1);
    expect(cliff.boundingBox?.max.y).toBeGreaterThanOrEqual(16 * 0.75);
  });

  it('drops to the lip in the notch, where the waterfall pours over', () => {
    let highest = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i) - notch.x) < 2) {
        highest = Math.max(highest, position.getY(i));
      }
    }
    expect(highest).toBeLessThanOrEqual(16 * CLIFF_LIP + 0.4);
  });

  it('sinks its foot below the ground, so no gap shows on uneven terrain', () => {
    cliff.computeBoundingBox();
    expect(cliff.boundingBox?.min.y).toBeLessThanOrEqual(-1.5);
  });

  it('leaves a walk-in opening free of rock, and the rest of the face where it was', () => {
    const opening = { x: 9, width: 3.24, height: 2.5, back: 0.1 };
    const open = cliffWall(1, 60, 16, notch, opening).getAttribute('position');
    for (let i = 0; i < open.count; i++) {
      const inside =
        Math.abs(open.getX(i) - opening.x) < opening.width / 2 - 1e-6 &&
        open.getY(i) < opening.height - 1e-6 &&
        open.getZ(i) > opening.back + 1e-6;
      expect(inside, `vertex ${i} inside the opening`).toBe(false);
    }

    // Columns clear of the opening draw the same numbers, so they keep their exact shape.
    const far = (attribute: typeof open) =>
      Array.from({ length: attribute.count }, (_, i) => i)
        .filter((i) => attribute.getX(i) < -20)
        .map((i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)].join());
    expect(far(open)).toEqual(far(position));
  });
});

describe('leafCluster', () => {
  const cluster = leafCluster();
  const position = cluster.getAttribute('position');
  const normal = cluster.getAttribute('normal');

  it('is seven curved leaves of 2 × 8 segments, indexed and smooth-shaded', () => {
    // A 2 × 8 plane has 3 × 9 corners and 2 × 8 × 2 triangles.
    expect(position.count).toBe(7 * 27);
    expect(cluster.index?.count).toBe(7 * 32 * 3);
    expect(normal.count).toBe(position.count);
    // Tinted per instance, so it carries no colour of its own.
    expect(cluster.getAttribute('color')).toBeUndefined();
  });

  it('rises from its root to about the length of one leaf and spreads around it', () => {
    cluster.computeBoundingBox();
    const box = cluster.boundingBox;

    expect(box?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(box?.max.y).toBeGreaterThan(0.7);
    expect(box?.max.y).toBeLessThanOrEqual(1.4);
    expect(box?.max.x).toBeGreaterThan(0.5);
    expect(box?.min.x).toBeLessThan(-0.5);
  });

  it('curves each leaf, so its normals are not those of a flat card', () => {
    const first = new Vector3().fromBufferAttribute(normal, 0);
    let bent = 0;
    for (let i = 1; i < 27; i++) {
      if (new Vector3().fromBufferAttribute(normal, i).dot(first) < 0.95) {
        bent++;
      }
    }
    expect(bent).toBeGreaterThan(0);
  });

  it('is the same every time: the variety comes from each instance', () => {
    expect(Array.from(leafCluster().getAttribute('position').array)).toEqual(
      Array.from(position.array),
    );
  });
});

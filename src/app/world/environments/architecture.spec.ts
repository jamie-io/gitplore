import { BufferGeometry, Vector3 } from 'three';
import {
  FOUNTAIN,
  MAST_TOP,
  bench,
  cypress,
  festoon,
  fountain,
  house,
  lampPost,
  mast,
  pottedOlive,
} from './architecture';

function box(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    throw new Error('no bounding box');
  }
  return bounds;
}

const HOUSE = {
  width: 8,
  depth: 9,
  height: 9,
  stucco: 0xe8c9a0,
  shutters: 0x3f7f7a,
  flowers: true,
};

describe('house', () => {
  it('stands on the ground with a roof 1.6–2.4 m above its walls', () => {
    const bounds = box(house(1, HOUSE));

    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.max.y).toBeGreaterThanOrEqual(HOUSE.height + 1.6);
    expect(bounds.max.y).toBeLessThanOrEqual(HOUSE.height + 2.4 + 1e-6);
  });

  it('faces +Z: doors, windows and awnings stand proud of the front wall only', () => {
    const bounds = box(house(2, { ...HOUSE, awning: 0x3f6f8f }));

    expect(bounds.max.z).toBeGreaterThan(HOUSE.depth / 2 + 0.5);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-HOUSE.depth / 2 - 0.31);
  });

  it('is vertex-coloured and faceted, like every other prop', () => {
    const geometry = house(3, HOUSE);

    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
  });

  it('is the same for the same seed', () => {
    expect(Array.from(house(4, HOUSE).getAttribute('position').array)).toEqual(
      Array.from(house(4, HOUSE).getAttribute('position').array),
    );
  });
});

describe.each([
  { name: 'cypress', build: () => cypress(1), top: [7.9, 8.4] },
  { name: 'pottedOlive', build: () => pottedOlive(1), top: [2.6, 3.1] },
  { name: 'lampPost', build: () => lampPost(), top: [4.2, 4.5] },
  { name: 'bench', build: () => bench(), top: [0.85, 1.0] },
  { name: 'mast', build: () => mast(), top: [MAST_TOP + 0.4, MAST_TOP + 0.7] },
  { name: 'fountain', build: () => fountain(), top: [3.5, 3.8] },
] as const)('$name', ({ build, top }) => {
  it('stands on the ground at its intended height', () => {
    const bounds = box(build());

    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.min.y).toBeLessThanOrEqual(0.01);
    expect(bounds.max.y).toBeGreaterThanOrEqual(top[0]);
    expect(bounds.max.y).toBeLessThanOrEqual(top[1]);
  });
});

describe('fountain', () => {
  it('stays inside its collider radius', () => {
    const bounds = box(fountain());

    expect(Math.max(bounds.max.x, -bounds.min.x)).toBeLessThanOrEqual(FOUNTAIN.radius);
  });

  it('keeps both water surfaces above their basin floors and below their rims', () => {
    expect(FOUNTAIN.lower.level).toBeGreaterThan(0.55);
    expect(FOUNTAIN.lower.level).toBeLessThan(0.92);
    expect(FOUNTAIN.upper.level).toBeGreaterThan(2.5);
    expect(FOUNTAIN.upper.level).toBeLessThan(2.64);
  });
});

describe('festoon', () => {
  const from = new Vector3(-10, 6, 0);
  const to = new Vector3(10, 6, 0);
  const string = festoon(from, to, 2, 20);

  it('hangs as many bulbs as asked for, all below the straight line between its ends', () => {
    expect(string.bulbs.length).toBe(20);
    for (const bulb of string.bulbs) {
      expect(bulb.y).toBeLessThan(6);
    }
  });

  it('sags deepest in the middle', () => {
    const middle = string.bulbs[9];
    const end = string.bulbs[0];

    expect(middle.y).toBeLessThan(end.y);
    expect(middle.y).toBeGreaterThan(6 - 2 - 0.2);
  });

  it('runs its wire from one end to the other', () => {
    const bounds = box(string.wire);

    expect(bounds.min.x).toBeLessThanOrEqual(-9.9);
    expect(bounds.max.x).toBeGreaterThanOrEqual(9.9);
  });
});

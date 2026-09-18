import { between, seededRandom, valueNoise } from './random';

/** The generator `jungle.ts` carried inline before this module existed: the yardstick for "nothing moved". */
function* legacy(seed: number): Generator<number> {
  let state = seed;
  for (;;) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    yield state / 4294967296;
  }
}

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);

    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('gives different sequences for different seeds', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);

    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays within [0, 1)', () => {
    const random = seededRandom(7);

    for (let i = 0; i < 10_000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces exactly the sequence the jungle used, so its trees do not move', () => {
    const random = seededRandom(20260911);
    const reference = legacy(20260911);

    for (let i = 0; i < 200; i++) {
      expect(random()).toBe(reference.next().value);
    }
  });
});

describe('between', () => {
  it('maps the unit interval onto [min, max)', () => {
    expect(between(() => 0, 2, 5)).toBe(2);
    expect(between(() => 0.5, 2, 5)).toBe(3.5);
  });
});

describe('valueNoise', () => {
  it('is deterministic', () => {
    expect(valueNoise(3.3, -7.1, 5)).toBe(valueNoise(3.3, -7.1, 5));
  });

  it('stays within [0, 1)', () => {
    for (let x = -20; x <= 20; x += 0.37) {
      for (let z = -20; z <= 20; z += 0.41) {
        const value = valueNoise(x, z, 3);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('is continuous, so neighbouring terrain faces get neighbouring colours', () => {
    expect(Math.abs(valueNoise(10.001, 4, 1) - valueNoise(10, 4, 1))).toBeLessThan(0.01);
  });

  it('changes with the seed', () => {
    expect(valueNoise(0.5, 0.5, 1)).not.toBe(valueNoise(0.5, 0.5, 2));
  });
});

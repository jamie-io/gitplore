import { GLIDE, planGlide, sampleGlide } from './glide';

describe('glides', () => {
  it('takes length / 22 seconds, clamped to 0.7–1.6', () => {
    expect(
      planGlide(
        [
          { x: 0, z: 0 },
          { x: 0, z: -11 },
        ],
        0,
      )!.duration,
    ).toBeCloseTo(0.7);
    expect(
      planGlide(
        [
          { x: 0, z: 0 },
          { x: 0, z: -22 },
        ],
        0,
      )!.duration,
    ).toBeCloseTo(1.0);
    expect(
      planGlide(
        [
          { x: 0, z: 0 },
          { x: 0, z: -60 },
        ],
        0,
      )!.duration,
    ).toBeCloseTo(1.6);
  });

  it('ignores glides under 0.4 m', () => {
    expect(
      planGlide(
        [
          { x: 0, z: 0 },
          { x: 0.3, z: 0 },
        ],
        0,
      ),
    ).toBeNull();
  });

  it('follows the polyline with ease-in-out and ends at the stand yaw', () => {
    const glide = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -10 },
        { x: 10, z: -10 },
      ],
      1.2,
    )!;
    expect(sampleGlide(glide, glide.duration / 2)).toMatchObject({ x: 0, z: -10 });
    expect(sampleGlide(glide, glide.duration)).toEqual({ x: 10, z: -10, yaw: 1.2 });
    expect(sampleGlide(glide, glide.duration / 4).z).toBeGreaterThan(-5); // eased: slower than linear at the start
  });

  it('measures the whole polyline, not the straight line between its ends', () => {
    const glide = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -10 },
        { x: 10, z: -10 },
      ],
      0,
    )!;

    expect(glide.length).toBeCloseTo(20);
    expect(glide.duration).toBeCloseTo(20 / GLIDE.speed);
  });

  it('faces the direction of travel along a straight stretch (yaw 0 faces −z)', () => {
    const north = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -30 },
      ],
      Math.PI,
    )!;
    const east = planGlide(
      [
        { x: 0, z: 0 },
        { x: 30, z: 0 },
      ],
      0,
    )!;

    expect(sampleGlide(north, north.duration * 0.3).yaw).toBeCloseTo(0);
    // East is +x, a quarter turn to the right, which is a negative yaw.
    expect(sampleGlide(east, east.duration * 0.3).yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('turns towards the stand yaw without a jump as it arrives', () => {
    const glide = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -30 },
      ],
      Math.PI / 2,
    )!;

    let previous = sampleGlide(glide, 0).yaw;
    for (let t = 0.02; t <= glide.duration; t += 0.02) {
      const { yaw } = sampleGlide(glide, t);
      expect(Math.abs(yaw - previous)).toBeLessThan(0.3);
      previous = yaw;
    }
    expect(sampleGlide(glide, glide.duration).yaw).toBe(Math.PI / 2);
  });

  it('rounds a corner rather than snapping the view round it', () => {
    const glide = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: -10 },
        { x: 10, z: -10 },
      ],
      -Math.PI / 2,
    )!;

    let previous = sampleGlide(glide, 0).yaw;
    for (let t = 0.01; t <= glide.duration; t += 0.01) {
      const { yaw } = sampleGlide(glide, t);
      expect(Math.abs(yaw - previous)).toBeLessThan(0.2);
      previous = yaw;
    }
  });

  it('starts at the first point and holds the end once over', () => {
    const glide = planGlide(
      [
        { x: 2, z: 3 },
        { x: 2, z: -7 },
      ],
      0.5,
    )!;

    expect(sampleGlide(glide, 0)).toMatchObject({ x: 2, z: 3 });
    expect(sampleGlide(glide, glide.duration + 5)).toEqual({ x: 2, z: -7, yaw: 0.5 });
  });

  it('writes into the sample it is handed, so a frame allocates nothing', () => {
    const glide = planGlide(
      [
        { x: 2, z: 3 },
        { x: 2, z: -7 },
      ],
      0.5,
    )!;
    const out = { x: 0, z: 0, yaw: 0 };

    expect(sampleGlide(glide, glide.duration / 2, out)).toBe(out);
    expect(out).toMatchObject({ x: 2, z: -2 });
    expect(sampleGlide(glide, glide.duration + 1, out)).toBe(out);
    expect(out).toEqual({ x: 2, z: -7, yaw: 0.5 });
  });

  it('ignores repeated points, so every stretch has a heading', () => {
    const glide = planGlide(
      [
        { x: 0, z: 0 },
        { x: 0, z: 0 },
        { x: 0, z: -20 },
      ],
      0,
    )!;

    expect(glide.length).toBeCloseTo(20);
    expect(Number.isFinite(sampleGlide(glide, 0.1).yaw)).toBe(true);
  });
});

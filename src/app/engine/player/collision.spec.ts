import { Collider, HeightField, STEP_HEIGHT, floorHeightAt, resolveCollisions } from './collision';

const wall: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: 4, maxZ: 6 };
const pillar: Collider = { kind: 'cylinder', x: 10, z: 0, radius: 1 };

const FLAT: HeightField = { heightAt: () => 0 };

describe('resolveCollisions', () => {
  it('leaves a position that touches nothing alone', () => {
    expect(resolveCollisions(0, 0, 0.4, [wall, pillar], 0)).toEqual({ x: 0, z: 0 });
  });

  it('pushes a circle out of a cylinder until the two just touch', () => {
    const { x, z } = resolveCollisions(9.5, 0, 0.4, [pillar], 0);

    expect(Math.hypot(x - pillar.x, z)).toBeCloseTo(1.4, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(x).toBeLessThan(9.5);
  });

  it('pushes a circle out of a box along the shallowest axis', () => {
    const { x, z } = resolveCollisions(0, 4.1, 0.5, [wall], 0);

    expect(z).toBeCloseTo(3.5, 6);
    expect(x).toBeCloseTo(0, 6);
  });

  it('pushes a circle out diagonally at a box corner', () => {
    const { x, z } = resolveCollisions(2.2, 3.8, 0.5, [wall], 0);

    expect(Math.hypot(x - wall.maxX, z - wall.minZ)).toBeCloseTo(0.5, 6);
  });

  it('resolves several colliders at once', () => {
    const near: Collider = { kind: 'cylinder', x: 0.3, z: 0, radius: 0.5 };
    const { x, z } = resolveCollisions(0, 4.2, 0.5, [wall, near], 0);

    expect(z).toBeCloseTo(3.5, 6);
    expect(Math.hypot(x - near.x, z - near.z)).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('does not divide by zero when a circle sits exactly on a cylinder axis', () => {
    const { x, z } = resolveCollisions(pillar.x, pillar.z, 0.4, [pillar], 0);

    expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
    expect(Math.hypot(x - pillar.x, z - pillar.z)).toBeCloseTo(1.4, 6);
  });

  it('keeps a collider without a top solid however high the feet are', () => {
    const { z } = resolveCollisions(0, 4.1, 0.5, [wall], 100);

    expect(z).toBeCloseTo(3.5, 6);
  });
});

describe('resolveCollisions with walkable tops', () => {
  const crate = (top: number): Collider => ({ ...wall, top });

  it('lets the player walk over a top within a step of the feet', () => {
    expect(resolveCollisions(0, 4.1, 0.5, [crate(STEP_HEIGHT)], 0)).toEqual({ x: 0, z: 4.1 });
  });

  it('still blocks a top further up than a step', () => {
    const { z } = resolveCollisions(0, 4.1, 0.5, [crate(STEP_HEIGHT + 0.01)], 0);

    expect(z).toBeCloseTo(3.5, 6);
  });

  it('lets a player who already stands high enough walk over the same top', () => {
    expect(resolveCollisions(0, 4.1, 0.5, [crate(1.2)], 1)).toEqual({ x: 0, z: 4.1 });
  });
});

describe('floorHeightAt', () => {
  const hill: HeightField = { heightAt: () => 2 };
  const crate: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: 4, maxZ: 6, top: 0.4 };

  it('is the terrain where no collider covers the point', () => {
    expect(floorHeightAt(0, 0, 0, hill, [crate])).toBe(2);
  });

  it('raises the floor onto a top the player can step up to', () => {
    expect(floorHeightAt(0, 5, 0, FLAT, [crate])).toBe(0.4);
  });

  it('ignores a top further up than a step', () => {
    const tall: Collider = { ...crate, top: 1.2 };

    expect(floorHeightAt(0, 5, 0, FLAT, [tall])).toBe(0);
  });

  it('reaches a higher top once the player stands on something', () => {
    const tall: Collider = { ...crate, top: 1.2 };

    expect(floorHeightAt(0, 5, 0.8, FLAT, [tall])).toBe(1.2);
  });

  it('ignores a collider the point lies outside', () => {
    expect(floorHeightAt(0, 3.9, 0, FLAT, [crate])).toBe(0);
  });

  it('ignores a collider with no top at all', () => {
    expect(floorHeightAt(0, 5, 0, FLAT, [wall])).toBe(0);
  });

  it('takes the highest of the tops covering the point', () => {
    const lower: Collider = { ...crate, top: 0.15 };

    expect(floorHeightAt(0, 5, 0, FLAT, [crate, lower])).toBe(0.4);
  });

  it('keeps the terrain when it already lies above the top', () => {
    expect(floorHeightAt(0, 5, 2, hill, [crate])).toBe(2);
  });

  it('stands the player on a cylinder top as well', () => {
    const drum: Collider = { kind: 'cylinder', x: 10, z: 0, radius: 1, top: 0.4 };

    expect(floorHeightAt(10.5, 0, 0, FLAT, [drum])).toBe(0.4);
    expect(floorHeightAt(11.5, 0, 0, FLAT, [drum])).toBe(0);
  });
});

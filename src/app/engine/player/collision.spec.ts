import { Collider, resolveCollisions } from './collision';

const wall: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: 4, maxZ: 6 };
const pillar: Collider = { kind: 'cylinder', x: 10, z: 0, radius: 1 };

describe('resolveCollisions', () => {
  it('leaves a position that touches nothing alone', () => {
    expect(resolveCollisions(0, 0, 0.4, [wall, pillar])).toEqual({ x: 0, z: 0 });
  });

  it('pushes a circle out of a cylinder until the two just touch', () => {
    const { x, z } = resolveCollisions(9.5, 0, 0.4, [pillar]);

    expect(Math.hypot(x - pillar.x, z)).toBeCloseTo(1.4, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(x).toBeLessThan(9.5);
  });

  it('pushes a circle out of a box along the shallowest axis', () => {
    const { x, z } = resolveCollisions(0, 4.1, 0.5, [wall]);

    expect(z).toBeCloseTo(3.5, 6);
    expect(x).toBeCloseTo(0, 6);
  });

  it('pushes a circle out diagonally at a box corner', () => {
    const { x, z } = resolveCollisions(2.2, 3.8, 0.5, [wall]);

    expect(Math.hypot(x - wall.maxX, z - wall.minZ)).toBeCloseTo(0.5, 6);
  });

  it('resolves several colliders at once', () => {
    const near: Collider = { kind: 'cylinder', x: 0.3, z: 0, radius: 0.5 };
    const { x, z } = resolveCollisions(0, 4.2, 0.5, [wall, near]);

    expect(z).toBeCloseTo(3.5, 6);
    expect(Math.hypot(x - near.x, z - near.z)).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('does not divide by zero when a circle sits exactly on a cylinder axis', () => {
    const { x, z } = resolveCollisions(pillar.x, pillar.z, 0.4, [pillar]);

    expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
    expect(Math.hypot(x - pillar.x, z - pillar.z)).toBeCloseTo(1.4, 6);
  });
});

/**
 * Horizontal collision for the kinematic player: a circle in the XZ plane against a list of static
 * colliders. No physics engine — there are no dynamics to simulate (IMPLEMENTATION_PLAN.md §2).
 */
export type Collider =
  | {
      readonly kind: 'aabb';
      readonly minX: number;
      readonly maxX: number;
      readonly minZ: number;
      readonly maxZ: number;
    }
  | { readonly kind: 'cylinder'; readonly x: number; readonly z: number; readonly radius: number };

/** Analytic ground height, implemented by the procedural terrain. */
export interface HeightField {
  heightAt(x: number, z: number): number;
}

export interface Point2 {
  x: number;
  z: number;
}

/** Pushes a circle at `(x, z)` out of every collider it overlaps, in order. */
export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  colliders: readonly Collider[],
): Point2 {
  let point: Point2 = { x, z };

  for (const collider of colliders) {
    point =
      collider.kind === 'cylinder'
        ? pushOutOfCylinder(point, radius, collider)
        : pushOutOfBox(point, radius, collider);
  }

  return point;
}

function pushOutOfCylinder(
  point: Point2,
  radius: number,
  collider: Extract<Collider, { kind: 'cylinder' }>,
): Point2 {
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  const distance = Math.hypot(dx, dz);
  const minimum = radius + collider.radius;

  if (distance >= minimum) {
    return point;
  }

  // Dead centre has no push direction of its own; +X is as good as any.
  if (distance === 0) {
    return { x: collider.x + minimum, z: collider.z };
  }

  const scale = minimum / distance;
  return { x: collider.x + dx * scale, z: collider.z + dz * scale };
}

function pushOutOfBox(
  point: Point2,
  radius: number,
  collider: Extract<Collider, { kind: 'aabb' }>,
): Point2 {
  const inside =
    point.x > collider.minX &&
    point.x < collider.maxX &&
    point.z > collider.minZ &&
    point.z < collider.maxZ;

  if (inside) {
    return outThroughShallowestFace(point, radius, collider);
  }

  const closestX = clamp(point.x, collider.minX, collider.maxX);
  const closestZ = clamp(point.z, collider.minZ, collider.maxZ);
  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  const distance = Math.hypot(dx, dz);

  if (distance >= radius || distance === 0) {
    return point;
  }

  const scale = radius / distance;
  return { x: closestX + dx * scale, z: closestZ + dz * scale };
}

function outThroughShallowestFace(
  point: Point2,
  radius: number,
  collider: Extract<Collider, { kind: 'aabb' }>,
): Point2 {
  const exits = [
    { depth: point.x - collider.minX, x: collider.minX - radius, z: point.z },
    { depth: collider.maxX - point.x, x: collider.maxX + radius, z: point.z },
    { depth: point.z - collider.minZ, x: point.x, z: collider.minZ - radius },
    { depth: collider.maxZ - point.z, x: point.x, z: collider.maxZ + radius },
  ];

  return exits.reduce((shallowest, exit) => (exit.depth < shallowest.depth ? exit : shallowest));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

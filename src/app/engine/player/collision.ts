/**
 * Horizontal collision for the kinematic player: a circle in the XZ plane against a list of static
 * colliders. No physics engine — there are no dynamics to simulate (IMPLEMENTATION_PLAN.md §2).
 *
 * A collider is a column. Its footprint is XZ-only and it reaches up forever unless it names a
 * `top`: the world Y of a surface the player is meant to end up standing on. A low enough `top`
 * turns a wall into a crate to climb; without one, nothing about the collider has changed.
 */

/**
 * How far above the feet a walkable `top` may sit and still be stepped onto rather than walked
 * into. One low crate, one kerb, one stair — anything higher is a wall until the player is higher.
 */
export const STEP_HEIGHT = 0.45;

export type Collider =
  | {
      readonly kind: 'aabb';
      readonly minX: number;
      readonly maxX: number;
      readonly minZ: number;
      readonly maxZ: number;
      /** A dynamic prop may turn its fixed footprint off without changing scene-array identity. */
      readonly enabled?: boolean;
      /**
       * World Y of the walkable surface on top of this collider. Left out, the collider is an
       * infinite wall — exactly how every prop behaved before tops existed.
       */
      readonly top?: number;
    }
  | {
      readonly kind: 'cylinder';
      readonly x: number;
      readonly z: number;
      readonly radius: number;
      /** A dynamic prop may turn its fixed footprint off without changing scene-array identity. */
      readonly enabled?: boolean;
      /** World Y of the walkable surface on top; see the box variant. */
      readonly top?: number;
    };

/** Analytic ground height, implemented by the procedural terrain. */
export interface HeightField {
  heightAt(x: number, z: number): number;
}

export interface Point2 {
  x: number;
  z: number;
}

/**
 * Pushes a circle at `(x, z)` out of every collider it overlaps, in order. A collider the player
 * can step onto — one whose `top` is at most `STEP_HEIGHT` above `feetY` — is walked over instead
 * of into, so it does not push at all. Pass `-Infinity` as `feetY` to treat every collider as solid.
 */
export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  colliders: readonly Collider[],
  feetY: number,
): Point2 {
  let point: Point2 = { x, z };

  for (const collider of colliders) {
    if (collider.enabled === false) {
      continue;
    }
    if (steppableTop(collider, feetY) !== null) {
      continue;
    }

    point =
      collider.kind === 'cylinder'
        ? pushOutOfCylinder(point, radius, collider)
        : pushOutOfBox(point, radius, collider);
  }

  return point;
}

/**
 * The highest walkable surface under `(x, z)`: the terrain, raised by every collider that covers
 * the point and is low enough to step onto. A collider too tall to climb is a wall rather than a
 * floor — `resolveCollisions` keeps the player out of it instead.
 */
export function floorHeightAt(
  x: number,
  z: number,
  feetY: number,
  ground: HeightField,
  colliders: readonly Collider[],
): number {
  let floor = ground.heightAt(x, z);

  for (const collider of colliders) {
    if (collider.enabled === false) {
      continue;
    }
    const top = steppableTop(collider, feetY);
    if (top !== null && top > floor && covers(collider, x, z)) {
      floor = top;
    }
  }

  return floor;
}

/** The surface a player with their feet at `feetY` could step onto, or `null` if this is a wall. */
function steppableTop(collider: Collider, feetY: number): number | null {
  const { top } = collider;
  return top !== undefined && top <= feetY + STEP_HEIGHT ? top : null;
}

/** Whether `(x, z)` lies inside the collider's footprint, ignoring the player's radius. */
function covers(collider: Collider, x: number, z: number): boolean {
  return collider.kind === 'cylinder'
    ? Math.hypot(x - collider.x, z - collider.z) <= collider.radius
    : x >= collider.minX && x <= collider.maxX && z >= collider.minZ && z <= collider.maxZ;
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

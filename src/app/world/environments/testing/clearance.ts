import { Collider } from '@engine/player/collision';

/** Metres from (x, z) to nearest relevant collider surface; negative means inside one. */
export function clearance(
  x: number,
  z: number,
  colliders: readonly Collider[],
  cameraY?: number,
): number {
  const relevant = colliders.filter(
    (collider) => cameraY === undefined || collider.top === undefined || collider.top > cameraY,
  );
  return Math.min(
    ...relevant.map((collider) =>
      collider.kind === 'cylinder'
        ? Math.hypot(x - collider.x, z - collider.z) - collider.radius
        : boxClearance(x, z, collider),
    ),
  );
}

/**
 * Signed, because an unsigned box distance clamps at zero and makes "inside a wall" and "against
 * a wall" the same number — which turns any assertion that a point is outside a box into a
 * tautology. Exactly 0 is reserved for a point in the plane of a face, which is also the one case
 * `resolveCollisions` treats as outside the box.
 */
function boxClearance(
  x: number,
  z: number,
  collider: Extract<Collider, { kind: 'aabb' }>,
): number {
  const outX = Math.max(collider.minX - x, x - collider.maxX);
  const outZ = Math.max(collider.minZ - z, z - collider.maxZ);

  if (outX > 0 || outZ > 0) {
    return Math.hypot(Math.max(outX, 0), Math.max(outZ, 0));
  }

  // Inside: how far it is back out through the nearest of the four faces.
  return Math.max(outX, outZ);
}

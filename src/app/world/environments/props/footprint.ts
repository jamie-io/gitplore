import { Euler, Vector3 } from 'three';
import { Collider } from '@engine/player/collision';

/**
 * The XZ box around a `halfWidth` × `halfDepth` footprint turned by `rotationY` about `origin`.
 * Colliders are axis-aligned, so a turned prop blocks the box that encloses it.
 */
export function rotatedAabb(
  origin: Vector3,
  halfWidth: number,
  halfDepth: number,
  rotationY: number,
): Extract<Collider, { kind: 'aabb' }> {
  const rotation = new Euler(0, rotationY, 0);
  const corners = [-halfWidth, halfWidth].flatMap((x) =>
    [-halfDepth, halfDepth].map((z) => new Vector3(x, 0, z).applyEuler(rotation).add(origin)),
  );

  return {
    kind: 'aabb',
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}

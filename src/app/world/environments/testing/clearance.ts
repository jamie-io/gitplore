import { Collider } from '@engine/player/collision';

/** Metres from (x, z) to the nearest collider's surface; negative inside one. For specs. */
export function clearance(x: number, z: number, colliders: readonly Collider[]): number {
  return Math.min(
    ...colliders.map((collider) =>
      collider.kind === 'cylinder'
        ? Math.hypot(x - collider.x, z - collider.z) - collider.radius
        : Math.hypot(
            Math.max(collider.minX - x, 0, x - collider.maxX),
            Math.max(collider.minZ - z, 0, z - collider.maxZ),
          ),
    ),
  );
}

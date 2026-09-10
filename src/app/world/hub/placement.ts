import type { LandmarkPlacement } from '../landmarks/base/landmark';

/** Metres from the spawn to an unpinned landmark. Far enough to walk to, near enough to see. */
export const RING_RADIUS = 30;

/** Where the ring starts, so the first landmark stands ahead of a player looking down −Z. */
const START_ANGLE = Math.PI;

/**
 * Evenly spaced spots on a ring around the spawn, each turned to face it.
 *
 * Deterministic on purpose: the world is rebuilt whenever the visitor returns to it, and a
 * landmark that moved between visits would read as a bug. Projects that must never move pin
 * `landmark.position` in `repo-overrides.ts` instead.
 */
export function ringPlacements(count: number): readonly LandmarkPlacement[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = START_ANGLE + (index / Math.max(count, 1)) * Math.PI * 2;
    const x = Math.sin(angle) * RING_RADIUS;
    const z = Math.cos(angle) * RING_RADIUS;

    // The front direction is (sin r, cos r); facing the spawn means pointing at the origin.
    return { position: [x, 0, z] as const, rotationY: angle + Math.PI };
  });
}

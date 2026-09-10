import type { LandmarkPlacement } from '../landmarks/base/landmark';

/** Metres from the spawn to an unpinned landmark. Far enough to walk to, near enough to see. */
export const RING_RADIUS = 30;

/** Where the ring starts, so the first landmark stands ahead of a player looking down −Z. */
const START_ANGLE = Math.PI;

/**
 * How far apart two landmarks have to stand. Below this they read as one cluttered object from
 * the spawn — the near one's glow plane covers the far one — and walking up to either is fiddly.
 */
export const MIN_LANDMARK_SEPARATION = 12;

/**
 * The densest the ring may get before its own spots break `MIN_LANDMARK_SEPARATION`: the chord
 * between neighbours on a circle of `RING_RADIUS` is `2 · r · sin(π / slots)`.
 */
const MAX_RING_SLOTS = Math.floor(
  Math.PI / Math.asin(Math.min(1, MIN_LANDMARK_SEPARATION / (2 * RING_RADIUS))),
);

type Position = readonly [number, number, number];

/** `slots` evenly spaced spots, the first one straight ahead of a player looking down −Z. */
function evenlySpaced(slots: number): LandmarkPlacement[] {
  return Array.from({ length: slots }, (_, index) => {
    const angle = START_ANGLE + (index / Math.max(slots, 1)) * Math.PI * 2;
    const x = Math.sin(angle) * RING_RADIUS;
    const z = Math.cos(angle) * RING_RADIUS;

    // The front direction is (sin r, cos r); facing the spawn means pointing at the origin.
    return { position: [x, 0, z] as const, rotationY: angle + Math.PI };
  });
}

function clears(spot: LandmarkPlacement, taken: readonly Position[]): boolean {
  return taken.every(
    (other) =>
      Math.hypot(spot.position[0] - other[0], spot.position[2] - other[2]) >=
      MIN_LANDMARK_SEPARATION,
  );
}

/**
 * Evenly spaced spots on a ring around the spawn, each turned to face it, skipping any spot that
 * would stand within `MIN_LANDMARK_SEPARATION` of a landmark in `avoid`.
 *
 * Skipping is why the ring is grown rather than rotated: an offset start angle only moves the
 * collision to a different pair. Asking for one more slot at a time and taking the first `count`
 * survivors keeps the spots that do get used spread evenly around the whole ring.
 *
 * Deterministic on purpose: the world is rebuilt whenever the visitor returns to it, and a
 * landmark that moved between visits would read as a bug. Projects that must never move pin
 * `landmark.position` in `repo-overrides.ts` instead.
 */
export function ringPlacements(
  count: number,
  avoid: readonly Position[] = [],
): readonly LandmarkPlacement[] {
  if (count <= 0) {
    return [];
  }

  for (let slots = count; slots <= MAX_RING_SLOTS; slots++) {
    const usable = evenlySpaced(slots).filter((spot) => clears(spot, avoid));

    if (usable.length >= count) {
      return usable.slice(0, count);
    }
  }

  // Nothing on the ring is clear — every slot is blocked, or there are more projects than the
  // ring has room for. A tight fit is still better than dropping a project out of the world.
  return evenlySpaced(count);
}

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

/** A pinned landmark position, exactly as `ProjectLandmark.position` spells it. */
export type Position = readonly [number, number, number];

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

/**
 * The first `count` candidates that stand clear of every position in `avoid`.
 *
 * Falls back to the unfiltered candidates when filtering leaves too few: a tight fit is better than
 * dropping a project out of the world, which is the same trade-off `ringPlacements` makes.
 */
export function clearOf(
  candidates: readonly LandmarkPlacement[],
  avoid: readonly Position[],
  count: number,
): readonly LandmarkPlacement[] {
  const usable = candidates.filter((spot) => clears(spot, avoid));

  return (usable.length >= count ? usable : candidates).slice(0, count);
}

/**
 * `count` spots spread over an arc of `radius` metres, swept `arc` radians wide and centred on −Z
 * (the direction `spawnYaw = 0` looks), each turned to face back at the origin — the arrival point
 * an environment spawns its visitor at.
 *
 * `jungle.ts` and `plaza.ts` are both "landmarks on an arc around the spawn", differing only in how
 * wide and how far out that arc is, so the formula lives once here rather than once per file: a
 * correction to the rotation maths that lands in one copy and not the other is exactly the kind of
 * bug identical code invites.
 *
 * A single spot has nothing to interpolate between — `index / (slots - 1)` would divide by zero —
 * so `slots === 1` is its own branch, placing that spot in the middle of the arc.
 */
export function arcAnchors(
  count: number,
  avoid: readonly Position[],
  radius: number,
  arc: number,
): readonly LandmarkPlacement[] {
  const slots = count + avoid.length;
  const candidates: LandmarkPlacement[] = Array.from({ length: slots }, (_, index) => {
    const t = slots === 1 ? 0.5 : index / (slots - 1);
    const angle = (t - 0.5) * arc;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;
    // Front direction is (sin r, cos r); facing the arrival point means pointing at the origin,
    // along (−x, −z). No extra half turn: that would show the arriving visitor the back.
    return { position: [x, 0, z] as const, rotationY: Math.atan2(-x, -z) };
  });

  return clearOf(candidates, avoid, count);
}

import type { LandmarkPlacement } from '../landmarks/base/landmark';

/** Metres from the spawn to the first landmark arc. */
export const RING_RADIUS = 20;

/** Metres from the spawn to the overflow landmark arc. */
export const OUTER_RING_RADIUS = 30;

/**
 * How far apart two landmarks have to stand. Below this they read as one cluttered object from
 * the spawn — the near one's glow plane covers the far one — and walking up to either is fiddly.
 */
export const MIN_LANDMARK_SEPARATION = 9;

/**
 * Both arcs are centred on −Z and span ±0.3π. Their capacity comes from the chord between
 * neighbours, not from a hard-coded project count.
 */
export const FRONT_ARC = Math.PI * 0.6;

function arcCapacity(radius: number): number {
  const minimumAngle = 2 * Math.asin(Math.min(1, MIN_LANDMARK_SEPARATION / (2 * radius)));
  return Math.floor(FRONT_ARC / minimumAngle) + 1;
}

const NEAR_RING_CAPACITY = arcCapacity(RING_RADIUS);
const OUTER_RING_CAPACITY = arcCapacity(OUTER_RING_RADIUS);
const MAX_RING_SLOTS = NEAR_RING_CAPACITY + OUTER_RING_CAPACITY;

/** A pinned landmark position, exactly as `ProjectLandmark.position` spells it. */
export type Position = readonly [number, number, number];

function clears(spot: LandmarkPlacement, taken: readonly Position[]): boolean {
  return taken.every(
    (other) =>
      Math.hypot(spot.position[0] - other[0], spot.position[2] - other[2]) >=
      MIN_LANDMARK_SEPARATION,
  );
}

function centreOutward(candidates: readonly LandmarkPlacement[]): readonly LandmarkPlacement[] {
  return [...candidates].sort((a, b) => {
    const aAngle = Math.atan2(a.position[0], -a.position[2]);
    const bAngle = Math.atan2(b.position[0], -b.position[2]);
    return Math.abs(aAngle) - Math.abs(bAngle) || aAngle - bAngle;
  });
}

function overflowPlacements(count: number): readonly LandmarkPlacement[] {
  const nearCount = Math.min(count, NEAR_RING_CAPACITY);
  const farCount = Math.max(0, count - nearCount);

  return [
    ...centreOutward(arcAnchors(nearCount, [], RING_RADIUS, FRONT_ARC)),
    ...centreOutward(arcAnchors(farCount, [], OUTER_RING_RADIUS, FRONT_ARC)),
  ];
}

/**
 * Evenly spaced spots on two front arcs around the spawn, each turned to face it. The near arc fills
 * from its centre outward; the outer arc carries overflow the same way. Pinned landmarks and
 * already selected spots are skipped.
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

  const target = Math.min(count, MAX_RING_SLOTS);
  const near = centreOutward(arcAnchors(NEAR_RING_CAPACITY, [], RING_RADIUS, FRONT_ARC)).filter(
    (spot) => clears(spot, avoid),
  );
  const selectedNear = near.slice(0, Math.min(target, near.length));
  const taken = [...avoid, ...selectedNear.map(({ position }) => position)];
  const far = centreOutward(
    arcAnchors(OUTER_RING_CAPACITY, [], OUTER_RING_RADIUS, FRONT_ARC),
  ).filter((spot) => clears(spot, taken));
  const selected = [...selectedNear, ...far.slice(0, target - selectedNear.length)];

  if (selected.length >= target && target === count) {
    return selected;
  }

  // Nothing on either arc is clear, or there are more projects than the arcs can hold. A tight fit
  // is still better than dropping a project out of the world.
  return avoid.length === 0 || count > MAX_RING_SLOTS
    ? overflowPlacements(count)
    : ringPlacements(count);
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

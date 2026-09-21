import type { LandmarkPlacement } from '../landmarks/base/landmark';

/** Metres from the spawn to near bearing slots. */
export const RING_RADIUS = 20;

/** Metres from the spawn to far bearing slots. */
export const OUTER_RING_RADIUS = 30;

/**
 * How far apart two landmarks have to stand. Below this they read as one cluttered object from
 * the spawn — the near one's glow plane covers the far one — and walking up to either is fiddly.
 */
export const MIN_LANDMARK_SEPARATION = 9;

/**
 * The bearing fan is centred on −Z and spans ±0.3π. Its capacity comes from portal visibility,
 * not from a hard-coded project count.
 */
export const FRONT_ARC = Math.PI * 0.6;

export const PORTAL_HALF_WIDTH = 3.5;
export const VISIBILITY_MARGIN = 3 * (Math.PI / 180);
/** Tiny margin absorbs trigonometric round-off when the slot grid lands on a separation boundary. */
const SLOT_GRID_EPSILON = 1e-10;
// Same-radius slots are two positions apart because near and far radii alternate.
const SLOT_GRID_BEARING_GAP =
  Math.max(
    Math.asin(Math.min(1, MIN_LANDMARK_SEPARATION / (2 * RING_RADIUS))),
    Math.asin(Math.min(1, MIN_LANDMARK_SEPARATION / (2 * OUTER_RING_RADIUS))),
  ) + SLOT_GRID_EPSILON;

function alternatingRadius(index: number): number {
  return index % 2 === 0 ? RING_RADIUS : OUTER_RING_RADIUS;
}

function minimumBearingGap(firstRadius: number, secondRadius: number): number {
  return (
    Math.max(
      Math.atan(PORTAL_HALF_WIDTH / firstRadius),
      Math.atan(PORTAL_HALF_WIDTH / secondRadius),
    ) + VISIBILITY_MARGIN
  );
}

function slotGridBearingGap(firstRadius: number, secondRadius: number): number {
  return Math.max(minimumBearingGap(firstRadius, secondRadius), SLOT_GRID_BEARING_GAP);
}

function requiredBearingSpan(slotCount: number): number {
  let span = 0;
  for (let index = 1; index < slotCount; index++) {
    span += slotGridBearingGap(alternatingRadius(index - 1), alternatingRadius(index));
  }
  return span;
}

function maxRingSlots(): number {
  let slots = 1;
  while (requiredBearingSpan(slots + 1) <= FRONT_ARC) {
    slots++;
  }
  return slots;
}

export const MAX_RING_SLOTS = maxRingSlots();

/** A pinned landmark position, exactly as `ProjectLandmark.position` spells it. */
export type Position = readonly [number, number, number];

interface SlotPlacement extends LandmarkPlacement {
  readonly bearing: number;
  readonly index: number;
  readonly radius: number;
}

function bearingOf(position: Position): number {
  return Math.atan2(position[0], -position[2]);
}

function isVisibleFromSpawn(first: SlotPlacement, second: Position): boolean {
  const secondRadius = Math.hypot(second[0], second[2]);
  if (secondRadius === 0) {
    return true;
  }

  return (
    Math.abs(first.bearing - bearingOf(second)) >= minimumBearingGap(first.radius, secondRadius)
  );
}

function clears(spot: SlotPlacement, taken: readonly Position[]): boolean {
  return taken.every(
    (other) =>
      Math.hypot(spot.position[0] - other[0], spot.position[2] - other[2]) >=
        MIN_LANDMARK_SEPARATION && isVisibleFromSpawn(spot, other),
  );
}

function clearsDistance(spot: LandmarkPlacement, taken: readonly Position[]): boolean {
  return taken.every(
    (other) =>
      Math.hypot(spot.position[0] - other[0], spot.position[2] - other[2]) >=
      MIN_LANDMARK_SEPARATION,
  );
}

function centreOutward(candidates: readonly SlotPlacement[]): readonly SlotPlacement[] {
  const centre = (candidates.length - 1) / 2;
  return [...candidates].sort((a, b) => {
    return Math.abs(a.index - centre) - Math.abs(b.index - centre) || a.index - b.index;
  });
}

function slotCandidates(count: number): readonly SlotPlacement[] {
  if (count <= 0) {
    return [];
  }

  const gaps = Array.from({ length: Math.max(0, count - 1) }, (_, index) =>
    slotGridBearingGap(alternatingRadius(index), alternatingRadius(index + 1)),
  );
  const requiredSpan = gaps.reduce((sum, gap) => sum + gap, 0);
  const span = Math.min(FRONT_ARC, requiredSpan);
  const scale = requiredSpan === 0 ? 0 : span / requiredSpan;
  let bearing = -span / 2;

  return Array.from({ length: count }, (_, index) => {
    const radius = alternatingRadius(index);
    const x = Math.sin(bearing) * radius;
    const z = -Math.cos(bearing) * radius;
    const placement: SlotPlacement = {
      bearing,
      index,
      position: [x, 0, z],
      radius,
      rotationY: Math.atan2(-x, -z),
    };
    bearing += (gaps[index] ?? 0) * scale;
    return placement;
  });
}

function asPlacement({ position, rotationY }: SlotPlacement): LandmarkPlacement {
  return { position, rotationY };
}

/**
 * Deterministic bearing slots in front of the spawn, each turned to face it. Radii alternate along
 * the bearing order so neighbouring portals differ in depth; pinned landmarks and already selected
 * slots are skipped.
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

  const candidates = centreOutward(slotCandidates(MAX_RING_SLOTS));
  const selected: SlotPlacement[] = [];
  const taken = [...avoid];

  for (const candidate of candidates) {
    if (!clears(candidate, taken)) {
      continue;
    }
    selected.push(candidate);
    taken.push(candidate.position);
    if (selected.length === count) {
      return selected.map(asPlacement);
    }
  }

  // Nothing is clear, or there are more projects than the visibility fan can hold. Return only
  // candidates that preserve both landmark invariants; dropping a portal is safer than stacking it.
  return selected.map(asPlacement);
}

/**
 * The first `count` candidates that stand clear of every position in `avoid`.
 *
 * Falls back to the unfiltered candidates when filtering leaves too few: arc-based callers use a
 * tight fit when they need the requested count, while `ringPlacements` leaves unsafe overflow
 * unplaced.
 */
export function clearOf(
  candidates: readonly LandmarkPlacement[],
  avoid: readonly Position[],
  count: number,
): readonly LandmarkPlacement[] {
  const usable = candidates.filter((spot) => clearsDistance(spot, avoid));

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

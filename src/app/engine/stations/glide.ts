import { GroundPoint } from './station';

/**
 * A glide covers its path at `speed` metres per second, but never in less than `min` or more than
 * `max` seconds: a hop across the deck still reads as a move, and the far end of the world is
 * never more than a breath away. Anything shorter than `ignoreBelow` metres is not a glide at all.
 */
export const GLIDE = { speed: 22, min: 0.7, max: 1.6, ignoreBelow: 0.4 } as const;

/**
 * Metres either side of a bend over which the heading turns from one stretch to the next. Capped
 * at half of the shorter stretch, so two bends never overlap.
 */
const CORNER_TURN = 3;

/** Metres before the stand over which the heading turns from the way of travel to the stand's. */
const ARRIVAL_TURN = 4;

/** Points closer than this are the same point; a stretch between them would have no heading. */
const SAME_POINT = 1e-6;

/** A planned move along the ground from where the player stands to a station's stand spot. */
export interface Glide {
  readonly points: readonly GroundPoint[];
  /** Metres along the whole polyline. */
  readonly length: number;
  /** Seconds from start to finish. */
  readonly duration: number;
  /** Which way the player faces once there. */
  readonly endYaw: number;
}

/**
 * Plans a glide along `points`, ending facing `endYaw`. `null` when the path is shorter than
 * `GLIDE.ignoreBelow`: the player is already there.
 */
export function planGlide(points: readonly GroundPoint[], endYaw: number): Glide | null {
  const kept: GroundPoint[] = [];
  let length = 0;
  for (const point of points) {
    const last = kept.at(-1);
    const step = last ? Math.hypot(point.x - last.x, point.z - last.z) : 0;
    if (last && step < SAME_POINT) {
      continue;
    }
    kept.push({ x: point.x, z: point.z });
    length += step;
  }

  if (kept.length < 2 || length < GLIDE.ignoreBelow) {
    return null;
  }

  const duration = Math.min(Math.max(length / GLIDE.speed, GLIDE.min), GLIDE.max);
  return { points: kept, length, duration, endYaw };
}

/** Where a glide has the player at one moment, and which way they face. */
export interface GlideSample {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Where the glide has the player `t` seconds in, and which way they face, written into `out` (a
 * fresh sample by default; the engine hands the same one every frame). The distance covered is
 * eased in and out; the heading follows the stretch being travelled (yaw 0 faces −z), turns
 * smoothly through each bend and settles on `endYaw` as the glide arrives.
 */
export function sampleGlide(
  glide: Glide,
  t: number,
  out: GlideSample = { x: 0, z: 0, yaw: 0 },
): GlideSample {
  const { points, length, duration, endYaw } = glide;
  if (t >= duration) {
    const end = points[points.length - 1];
    out.x = end.x;
    out.z = end.z;
    out.yaw = endYaw;
    return out;
  }

  const covered = ease(Math.max(t, 0) / duration) * length;

  // Which stretch the player is on, and how far along it.
  let start = 0;
  let index = 0;
  for (; index < points.length - 2; index++) {
    const stretch = distance(points[index], points[index + 1]);
    if (covered <= start + stretch) {
      break;
    }
    start += stretch;
  }
  const from = points[index];
  const to = points[index + 1];
  const stretch = distance(from, to);
  const share = stretch > 0 ? Math.min((covered - start) / stretch, 1) : 1;
  const x = from.x + (to.x - from.x) * share;
  const z = from.z + (to.z - from.z) * share;

  let yaw = heading(from, to);
  // Coming out of the bend at the start of this stretch.
  if (index > 0) {
    const reach = Math.min(CORNER_TURN, stretch / 2, distance(points[index - 1], from) / 2);
    if (covered - start < reach) {
      const w = smoothstep((covered - start + reach) / (2 * reach));
      yaw = turn(heading(points[index - 1], from), yaw, w);
    }
  }
  // Going into the bend at its end.
  if (index < points.length - 2) {
    const next = points[index + 2];
    const reach = Math.min(CORNER_TURN, stretch / 2, distance(to, next) / 2);
    const left = start + stretch - covered;
    if (left < reach) {
      const w = smoothstep((reach - left) / (2 * reach));
      yaw = turn(yaw, heading(to, next), w);
    }
  }
  // Settling on the stand's heading.
  const settle = Math.min(ARRIVAL_TURN, length / 2);
  const left = length - covered;
  if (left < settle) {
    yaw = turn(yaw, endYaw, smoothstep((settle - left) / settle));
  }

  out.x = x;
  out.z = z;
  out.yaw = yaw;
  return out;
}

/** `t < .5 ? 2t² : 1 − (−2t + 2)² / 2`: starts gently, lands gently. */
function ease(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

function smoothstep(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

function distance(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** The yaw that faces from `a` towards `b`; yaw 0 faces −z, as the player controller has it. */
function heading(a: GroundPoint, b: GroundPoint): number {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

/**
 * Turns from yaw `a` towards yaw `b` by share `w`, the short way round. At `w` = 1 it returns `b`
 * itself, so a heading that has finished turning is exactly the one asked for.
 */
export function turn(a: number, b: number, w: number): number {
  if (w >= 1) {
    return b;
  }
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * w;
}

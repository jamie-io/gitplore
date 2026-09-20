import { Vector3 } from 'three';
import { Collider, HeightField, floorHeightAt, resolveCollisions } from './collision';

/** What the player wants to do this frame, independent of how the input was produced. */
export interface MoveIntent {
  /** -1 back … 1 forward. */
  readonly forward: number;
  /** -1 left … 1 right. */
  readonly strafe: number;
  readonly run: boolean;
  readonly jump: boolean;
  /** Radians to turn to the right this frame. */
  readonly yawDelta: number;
  /** Radians to look down this frame. */
  readonly pitchDelta: number;
}

export const NO_INTENT: MoveIntent = {
  forward: 0,
  strafe: 0,
  run: false,
  jump: false,
  yawDelta: 0,
  pitchDelta: 0,
};

export const PLAYER_EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 4.5;
export const RUN_MULTIPLIER = 1.9;
export const GRAVITY = 24;
export const JUMP_SPEED = 7;

/**
 * Horizontal acceleration on the ground, in m/s². `WALK_SPEED` and `RUN_MULTIPLIER` remain the cap;
 * this only says how long the ramp up to it takes — about 0.16 s from standing to a walk.
 */
export const ACCELERATION = 28;

/**
 * Horizontal braking on the ground, in m/s². A shade sharper than the ramp, so letting go of the
 * keys reads as a decision rather than as a slide.
 */
export const DECELERATION = 34;

/** The share of `ACCELERATION` that still steers the player while they are off the ground. */
export const AIR_CONTROL = 0.4;

/** Seconds after walking off an edge in which a jump still counts as a jump from the ground. */
export const COYOTE_TIME = 0.12;

/**
 * How far a player who is *already on the ground* is pulled back down onto a floor that has
 * dropped away beneath them. Without it a downhill stride leaves the ground on nearly every frame
 * and the walk loses its friction, its footfalls and its jump. It never catches someone who is
 * airborne, or the last 0.3 m of every jump would be a teleport instead of a fall; and it is kept
 * well under `STEP_HEIGHT`, so an edge a visitor can see is still an edge they fall off.
 */
export const GROUND_SNAP = 0.3;

/** Metres of ground covered by one full stride, that is by two steps. */
export const STRIDE_LENGTH = 4;

/** Just short of straight up, so the view never flips over. */
export const MAX_PITCH = Math.PI / 2 - 0.02;

const TAU = Math.PI * 2;

/**
 * Kinematic capsule: no physics engine, just gravity, an analytic ground height and circle-vs-collider
 * push-out (IMPLEMENTATION_PLAN.md §2). Horizontal motion carries momentum — the intent sets a
 * target velocity that the current one is steered towards — so starting, stopping and turning all
 * take a moment instead of snapping.
 */
export class PlayerController {
  readonly position = new Vector3(0, PLAYER_EYE_HEIGHT, 0);

  yaw = 0;
  pitch = 0;

  /**
   * The walk cycle in radians, wrapped to `[0, 2π)`. It advances with the ground the player
   * actually covers while they are standing on it — walking into a wall covers none — so one full
   * turn is one stride and **a foot lands at every crossing of 0 and of π**. The avatar's legs and
   * the footstep sounds both read this one phase, which is the only way they can never drift apart.
   */
  stridePhase = 0;

  /** Metres per second; `y` is the fall speed, `x`/`z` the horizontal momentum. */
  private readonly velocity = new Vector3();
  private grounded = false;

  /** Metres of ground covered horizontally last frame, after the colliders had their say. */
  private lastStep = 0;

  /** Seconds of grace left in which a jump still counts, after walking off an edge. */
  private coyote = 0;

  /**
   * Moves the player and defines the full orientation they arrive with. Pitch resets by default:
   * every destination wants a level horizon, and leaving it to callers only stales it.
   */
  teleport(position: Vector3, yaw = this.yaw, pitch = 0): void {
    this.position.copy(position);
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
    this.lastStep = 0;
    this.grounded = false;
    this.coyote = 0;
  }

  update(
    dt: number,
    intent: MoveIntent,
    ground: HeightField,
    colliders: readonly Collider[],
  ): void {
    this.yaw -= intent.yawDelta;
    this.pitch = clamp(this.pitch - intent.pitchDelta, -MAX_PITCH, MAX_PITCH);

    // One footing for the whole frame, so the same surface decides both what can be stepped onto
    // and what is a wall. Taking it after gravity would lose a step of exactly `STEP_HEIGHT`.
    const feetY = this.position.y - PLAYER_EYE_HEIGHT;

    this.move(dt, intent, colliders, feetY);
    this.fall(dt, intent, ground, colliders, feetY);
    this.advanceStride();
  }

  private move(
    dt: number,
    intent: MoveIntent,
    colliders: readonly Collider[],
    feetY: number,
  ): void {
    // Forward is -Z at yaw 0, matching the Three.js camera convention.
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let dx = forwardX * intent.forward + rightX * intent.strafe;
    let dz = forwardZ * intent.forward + rightZ * intent.strafe;

    const length = Math.hypot(dx, dz);
    if (length > 1) {
      dx /= length;
      dz /= length;
    }

    const cap = WALK_SPEED * (intent.run ? RUN_MULTIPLIER : 1);
    this.steer(dt, dx * cap, dz * cap, length > 0);

    if (this.velocity.x === 0 && this.velocity.z === 0) {
      // Standing perfectly still resolves nothing, so a teleport that lands inside a collider
      // stays where it was put — as it always has.
      this.lastStep = 0;
      return;
    }

    const resolved = resolveCollisions(
      this.position.x + this.velocity.x * dt,
      this.position.z + this.velocity.z * dt,
      PLAYER_RADIUS,
      colliders,
      feetY,
    );

    // Ground genuinely covered: a wall takes it away, and a push-out shoving the player clear of a
    // collider must never hand back more of it than they meant to walk.
    this.lastStep = Math.min(
      Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z),
      Math.hypot(this.velocity.x, this.velocity.z) * dt,
    );

    this.position.x = resolved.x;
    this.position.z = resolved.z;
  }

  /**
   * Steers the horizontal velocity towards the one the intent asks for, as fast as the player's
   * footing allows. Because it is the velocity that is capped and not the step, the top speed is
   * still exactly `WALK_SPEED` times the run multiplier.
   */
  private steer(dt: number, targetX: number, targetZ: number, wanted: boolean): void {
    // Mid-air there is nothing to push against: with no input, momentum simply carries.
    if (!this.grounded && !wanted) {
      return;
    }

    const rate = (wanted ? ACCELERATION : DECELERATION) * (this.grounded ? 1 : AIR_CONTROL);
    const dx = targetX - this.velocity.x;
    const dz = targetZ - this.velocity.z;
    const distance = Math.hypot(dx, dz);
    const step = rate * dt;

    if (distance <= step) {
      this.velocity.x = targetX;
      this.velocity.z = targetZ;
      return;
    }

    this.velocity.x += (dx / distance) * step;
    this.velocity.z += (dz / distance) * step;
  }

  private fall(
    dt: number,
    intent: MoveIntent,
    ground: HeightField,
    colliders: readonly Collider[],
    feetY: number,
  ): void {
    if (intent.jump && (this.grounded || this.coyote > 0)) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      // Spending the grace is what stops a held jump key from becoming a second jump.
      this.coyote = 0;
    }

    this.velocity.y -= GRAVITY * dt;
    this.position.y += this.velocity.y * dt;

    const floor =
      floorHeightAt(this.position.x, this.position.z, feetY, ground, colliders) + PLAYER_EYE_HEIGHT;
    // `this.grounded` still holds last frame's footing here, and the jump above clears it on
    // takeoff: the snap may only pull down someone the ground has slipped away from, never
    // someone who is in the air on purpose.
    const landed =
      this.position.y <= floor ||
      (this.grounded && this.velocity.y <= 0 && this.position.y - floor <= GROUND_SNAP);

    if (landed) {
      this.position.y = floor;
      this.velocity.y = 0;
      this.grounded = true;
      this.coyote = COYOTE_TIME;
    } else {
      this.grounded = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
  }

  private advanceStride(): void {
    if (!this.grounded) {
      return;
    }

    this.stridePhase = (this.stridePhase + (TAU * this.lastStep) / STRIDE_LENGTH) % TAU;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

import { Vector3 } from 'three';
import { Collider, HeightField, resolveCollisions } from './collision';

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

/** Just short of straight up, so the view never flips over. */
export const MAX_PITCH = Math.PI / 2 - 0.02;

/**
 * Kinematic capsule: no physics engine, just gravity, an analytic ground height and circle-vs-collider
 * push-out (IMPLEMENTATION_PLAN.md §2).
 */
export class PlayerController {
  readonly position = new Vector3(0, PLAYER_EYE_HEIGHT, 0);

  yaw = 0;
  pitch = 0;

  private velocityY = 0;
  private grounded = false;

  /**
   * Moves the player and defines the full orientation they arrive with. Pitch resets by default:
   * every destination wants a level horizon, and leaving it to callers only stales it.
   */
  teleport(position: Vector3, yaw = this.yaw, pitch = 0): void {
    this.position.copy(position);
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocityY = 0;
    this.grounded = false;
  }

  update(
    dt: number,
    intent: MoveIntent,
    ground: HeightField,
    colliders: readonly Collider[],
  ): void {
    this.yaw -= intent.yawDelta;
    this.pitch = clamp(this.pitch - intent.pitchDelta, -MAX_PITCH, MAX_PITCH);

    this.move(dt, intent, colliders);
    this.fall(dt, intent, ground);
  }

  private move(dt: number, intent: MoveIntent, colliders: readonly Collider[]): void {
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

    if (length === 0) {
      return;
    }

    const speed = WALK_SPEED * (intent.run ? RUN_MULTIPLIER : 1) * dt;
    const resolved = resolveCollisions(
      this.position.x + dx * speed,
      this.position.z + dz * speed,
      PLAYER_RADIUS,
      colliders,
    );

    this.position.x = resolved.x;
    this.position.z = resolved.z;
  }

  private fall(dt: number, intent: MoveIntent, ground: HeightField): void {
    if (intent.jump && this.grounded) {
      this.velocityY = JUMP_SPEED;
      this.grounded = false;
    }

    this.velocityY -= GRAVITY * dt;
    this.position.y += this.velocityY * dt;

    const floor = ground.heightAt(this.position.x, this.position.z) + PLAYER_EYE_HEIGHT;
    if (this.position.y <= floor) {
      this.position.y = floor;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

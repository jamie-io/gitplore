import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';

/** Any `{x, y, z}`, so a scene can hand over a plain literal as readily as a three `Vector3`. */
export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where a shot puts the camera and what it looks at. Without a `fov`, the rig's is kept. */
export interface ShotPose {
  readonly position: Vec3Like;
  readonly target: Vec3Like;
  readonly fov?: number;
}

export type ShotKind = 'arrival' | 'moment';

/**
 * A scripted camera move: a pose, and a timeline of how strongly it overrides the rig. The weight
 * is 1 where the camera stands on the pose, 0 where the rig has it, and anything between is a
 * blend of the two — which is why a shot always hands back without a jump.
 */
export interface CameraShot {
  readonly kind: ShotKind;
  readonly pose: ShotPose;
  /** Seconds from the start after which the shot is over and the rig has the camera alone. */
  readonly duration: number;
  /** How far the camera stands on the pose `t` seconds into the shot, from 0 to 1. */
  weight(t: number): number;
}

/** Arrival: the overview holds for `hold` seconds, then eases down to the shoulder over `ease`. */
export const ARRIVAL = { hold: 1.2, ease: 1.8 } as const;

/** A scene's key moment: up to the overview over `rise`, back down over the last `fall`. */
export const MOMENT = { rise: 0.5, total: 2.6, fall: 0.5 } as const;

/** How long a skipped shot takes to ease back to the rig. */
export const SKIP_SECONDS = 0.3;

/** `t²(3 − 2t)` over 0..1: starts and lands without a jolt. */
export function smoothstep(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/**
 * The overview a visitor arrives to: held while they take the layout in, then eased down onto
 * the shoulder. Under reduced motion it is held just as long and then cut, with nothing to ease.
 */
export function arrivalShot(pose: ShotPose, reducedMotion: boolean): CameraShot {
  const end = ARRIVAL.hold + ARRIVAL.ease;
  if (reducedMotion) {
    return {
      kind: 'arrival',
      pose,
      duration: ARRIVAL.hold,
      weight: (t) => (t <= ARRIVAL.hold ? 1 : 0),
    };
  }
  return {
    kind: 'arrival',
    pose,
    duration: end,
    weight: (t) => {
      if (t <= ARRIVAL.hold) {
        return 1;
      }
      // Stated outright at the end: the division can land a hair short of 1 and leave a sliver.
      if (t >= end) {
        return 0;
      }
      return 1 - smoothstep((t - ARRIVAL.hold) / ARRIVAL.ease);
    },
  };
}

/**
 * A scene's key event seen from the overview: eased up, held while it plays out, eased back.
 * Under reduced motion it cuts to the overview and cuts back when the time is up.
 */
export function momentShot(pose: ShotPose, reducedMotion: boolean): CameraShot {
  const { rise, total, fall } = MOMENT;
  if (reducedMotion) {
    return { kind: 'moment', pose, duration: total, weight: (t) => (t < total ? 1 : 0) };
  }
  return {
    kind: 'moment',
    pose,
    duration: total,
    weight: (t) => {
      if (t <= 0 || t >= total) {
        return 0;
      }
      if (t < rise) {
        return smoothstep(t / rise);
      }
      if (t > total - fall) {
        return 1 - smoothstep((t - (total - fall)) / fall);
      }
      return 1;
    },
  };
}

// Scratch space for `blendCamera`, which runs every frame of a shot and must not allocate.
const shotPosition = new Vector3();
const shotTarget = new Vector3();
const shotLook = new Matrix4();
const shotRotation = new Quaternion();

/**
 * Applies weight `w` of `pose` over the camera the rig has just placed: the position is lerped,
 * the orientation slerped toward looking from the pose at its target, the field of view lerped.
 * The rig places the camera afresh every frame, so the blend never compounds from one to the next.
 */
export function blendCamera(camera: PerspectiveCamera, pose: ShotPose, w: number): void {
  if (w <= 0) {
    return;
  }

  const weight = Math.min(w, 1);
  shotPosition.set(pose.position.x, pose.position.y, pose.position.z);
  shotTarget.set(pose.target.x, pose.target.y, pose.target.z);
  // A camera looks down its own −Z, which is the convention `Matrix4.lookAt` builds for.
  shotLook.lookAt(shotPosition, shotTarget, camera.up);
  shotRotation.setFromRotationMatrix(shotLook);

  if (weight === 1) {
    camera.position.copy(shotPosition);
    camera.quaternion.copy(shotRotation);
  } else {
    camera.position.lerp(shotPosition, weight);
    camera.quaternion.slerp(shotRotation, weight);
  }

  if (pose.fov !== undefined) {
    const fov = weight === 1 ? pose.fov : camera.fov + (pose.fov - camera.fov) * weight;
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}

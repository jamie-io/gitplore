import { PerspectiveCamera } from 'three';
import { Collider, HeightField } from './collision';
import { PlayerController } from './player-controller';

/**
 * What a rig needs beyond the player to place the camera for one frame: the step its easing
 * integrates over, the world a boom has to stay out of, and whether the visitor asked for less
 * motion.
 */
export interface RigFrame {
  /** Seconds since the last frame, already clamped by the engine. */
  readonly dt: number;
  readonly ground: HeightField;
  readonly colliders: readonly Collider[];
  /** `prefers-reduced-motion`: every easing the camera does collapses to an instant follow. */
  readonly reducedMotion: boolean;
}

/**
 * Places the camera for the player it is handed, and owns nothing else: no state the scene owns,
 * and no opinion about how the player got here (IMPLEMENTATION_PLAN.md §2).
 */
export interface CameraRig {
  sync(player: PlayerController, frame: RigFrame): void;

  /**
   * Forgets whatever the rig carries between frames. The engine calls it on the rig being switched
   * in, which has not watched the player since it was last on screen: without it the camera eases
   * in from wherever that rig left off instead of being placed where the player is now.
   */
  reset(): void;
}

/**
 * First-person view: the camera simply is the player's head. It needs nothing from the frame —
 * there is no boom to keep out of a wall, and nothing to ease.
 */
export class FirstPersonRig implements CameraRig {
  constructor(private readonly camera: PerspectiveCamera) {
    // Yaw first, then pitch: the ZXY default would roll the view when looking up while turning.
    camera.rotation.order = 'YXZ';
  }

  sync(player: PlayerController): void {
    this.camera.position.copy(player.position);
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;
    this.camera.rotation.z = 0;
  }

  reset(): void {
    // Nothing is carried from one frame to the next: the camera is the head, every frame.
  }
}

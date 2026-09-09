import { PerspectiveCamera } from 'three';
import { PlayerController } from './player-controller';

/**
 * First-person view: the camera simply is the player's head. A third-person view would be a
 * different rig, not a change here (IMPLEMENTATION_PLAN.md §2).
 */
export class FirstPersonRig {
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
}

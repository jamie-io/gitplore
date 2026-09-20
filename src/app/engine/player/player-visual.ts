import { Object3D } from 'three';
import { PlayerController } from './player-controller';

/**
 * The body the player sees themselves in (IMPLEMENTATION_PLAN.md §2).
 *
 * `@engine` may not import `@world`, so the engine never names the figure: a scene builds its own
 * avatar and hands it over in the world description, beside `ground` and `colliders`, and the
 * engine only drives it. Everything the animation needs is already on the controller — the
 * position, the yaw, the footing and the one `stridePhase` the footstep audio reads as well — so a
 * visual never keeps a walk cycle of its own to drift out of step with.
 */
export interface PlayerVisual {
  /** Added to the scene by whoever owns the avatar, never by the engine. */
  readonly object: Object3D;

  /** Places and poses the figure for one frame, straight after the player has moved. */
  sync(player: PlayerController, dt: number): void;

  /**
   * First person hides the body without taking its shadow away — which is why this is a mode and
   * not `object.visible`. See `Explorer.setFirstPerson` for how, and why nothing else works.
   */
  setFirstPerson(on: boolean): void;

  dispose(): void;
}

import { PerspectiveCamera, Scene } from 'three';
import { AssetLike } from './asset.service';
import { ShotPose } from './camera/camera-shot';
import { QualitySettings } from './capability.service';
import { Interactable } from './interaction/interactable';
import { Collider, HeightField } from './player/collision';
import { PlayerController } from './player/player-controller';
import { PlayerVisual } from './player/player-visual';
import {
  GroundPoint,
  ScenePitch,
  StationPlate,
  StationSpec,
  StationStand,
} from './stations/station';

/** What a scene gets handed on `init`/`update` (IMPLEMENTATION_PLAN.md §2). */
export interface WorldContext {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly player: PlayerController;
  readonly quality: QualitySettings;
  readonly assets: AssetLike;
}

export interface WorldObject {
  readonly id: string;
  init(ctx: WorldContext): Promise<void> | void;
  update(dt: number, ctx: WorldContext): void;
  dispose(): void;
}

/** Anything the render loop drives every frame. */
export interface Tickable {
  update(dt: number): void;
}

/**
 * A scene the player can walk around in: it owns the ground, the things to bump into and the
 * things to use.
 */
export interface WorldScene extends WorldObject {
  readonly ground: HeightField;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];
  /** Optional world-local restart action, used by flows that expose the restart key. */
  readonly restart?: (player: PlayerController) => void;
  /**
   * The body the player walks around in. The scene builds it, because `@engine` may not import
   * `@world` and the figure is cut from the place it stands in; the engine only drives and hides
   * it. Optional so a test scene need not carry one.
   */
  readonly avatar?: PlayerVisual;

  /**
   * The stops the visitor can glide between with the number keys and the station bar (spec §2), in
   * order. A world without them has no bar, no plates, and the number keys do nothing in it.
   */
  readonly stations?: readonly StationSpec[];
  /** Where the 0 key glides to: in front of the portal the visitor arrived through. */
  readonly portalStand?: StationStand;
  /** The pose that frames the whole world, for the arrival camera and the key moment. */
  readonly overview?: ShotPose;
  /** The project's name and one line, shown over the arrival camera. */
  readonly pitch?: ScenePitch;
  /** The way a glide takes between two spots, e.g. along the paths; a straight line by default. */
  glidePath?(from: GroundPoint, to: GroundPoint): readonly GroundPoint[];
  /** The plate for a find at (x, z) that is not a station, e.g. the portal; `null` for none. */
  plateAt?(x: number, z: number): StationPlate | null;
}

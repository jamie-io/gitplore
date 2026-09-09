import { PerspectiveCamera, Scene } from 'three';
import { AssetLike } from './asset.service';
import { QualitySettings } from './capability.service';
import { Interactable } from './interaction/interactable';
import { Collider, HeightField } from './player/collision';
import { PlayerController } from './player/player-controller';

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
}

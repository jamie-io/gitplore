import { Group, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D, markManaged } from '@engine/dispose';
import type { Project } from '@content/project.model';

/** Metres in front of a landmark where the player stands after returning from it. */
export const SPAWN_DISTANCE = 3;

/** Where landmark textures come from; `AssetService` refcounts them from M5 on. */
export interface TextureProvider {
  load(url: string): Texture;
  release(url: string): void;
}

/** Plain loader without caching — fine until there is more than one screen per texture. */
export class PlainTextureProvider implements TextureProvider {
  private readonly loader = new TextureLoader();
  private readonly loaded = new Map<string, Texture>();

  load(url: string): Texture {
    const texture = markManaged(this.loader.load(url));
    texture.colorSpace = SRGBColorSpace;
    this.loaded.set(url, texture);
    return texture;
  }

  release(url: string): void {
    this.loaded.get(url)?.dispose();
    this.loaded.delete(url);
  }
}

export interface LandmarkOptions {
  readonly project: Project;
  readonly ground: HeightField;
  readonly reducedMotion: boolean;
  /** The landmark was used; the page turns this into the `/p/:slug` route (§3). */
  readonly onEnter: (project: Project) => void;
  /** The landmark wants to run its in-world demo; the page hands it the controls (§5). */
  readonly onDemo?: (landmark: Landmark) => void;
  readonly textures?: TextureProvider;
}

/**
 * One project's place in the world (IMPLEMENTATION_PLAN.md §2): a group of meshes, what it
 * blocks, what it offers to use, and where the player reappears after visiting it.
 */
export abstract class Landmark implements WorldObject {
  readonly id: string;
  readonly project: Project;
  readonly group = new Group();

  /** Ground-level centre of the landmark. */
  readonly position: Vector3;
  readonly rotationY: number;

  /** Ground-level point in front of the landmark where a returning player stands. */
  readonly spawn: Vector3;
  /** Player yaw at `spawn` that faces away from the landmark. */
  readonly spawnYaw: number;

  protected readonly textures: TextureProvider;
  protected readonly reducedMotion: boolean;
  protected readonly onEnter: (project: Project) => void;
  protected readonly onDemo: ((landmark: Landmark) => void) | undefined;

  /** The world this landmark lives in, from `init` on. */
  protected ctx: WorldContext | null = null;

  /** In-world demo hooks (§5); only landmarks of `demo.mode: 'in-world'` projects define them. */
  enter?(): void;
  exit?(): void;
  interact?(): void;
  /** What the HUD tells the visitor while the demo runs. */
  readonly demoHint: string | null = null;

  constructor(options: LandmarkOptions) {
    const { position, rotationY } = options.project.landmark;

    this.project = options.project;
    this.id = `landmark:${options.project.slug}`;
    this.rotationY = rotationY;
    this.textures = options.textures ?? new PlainTextureProvider();
    this.reducedMotion = options.reducedMotion;
    this.onEnter = options.onEnter;
    this.onDemo = options.onDemo;

    this.position = new Vector3(
      position[0],
      options.ground.heightAt(position[0], position[2]),
      position[2],
    );
    this.spawn = this.position.clone().addScaledVector(this.front(), SPAWN_DISTANCE);
    this.spawn.y = options.ground.heightAt(this.spawn.x, this.spawn.z);
    // Player forward is (-sin yaw, -cos yaw); the front direction is (sin r, cos r).
    this.spawnYaw = rotationY + Math.PI;

    this.group.position.copy(this.position);
    this.group.rotation.y = rotationY;
    this.group.name = this.id;
  }

  private shape?: LandmarkShape;

  /** What the landmark blocks. Independent of the scene, so it is known before `init`. */
  get colliders(): readonly Collider[] {
    return (this.shape ??= this.describe()).colliders;
  }

  /** What the landmark offers to use. */
  get interactables(): readonly Interactable[] {
    return (this.shape ??= this.describe()).interactables;
  }

  /** Unit vector pointing out of the landmark's front, towards approaching visitors. */
  front(): Vector3 {
    return new Vector3(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
  }

  /** Turns a point in the landmark's local frame (before rotation) into world space. */
  protected toWorld(localX: number, localY: number, localZ: number): Vector3 {
    return new Vector3(localX, localY, localZ).applyEuler(this.group.rotation).add(this.position);
  }

  init(ctx: WorldContext): void {
    this.ctx = ctx;
    this.build(ctx);
    ctx.scene.add(this.group);
  }

  update(dt: number, ctx: WorldContext): void {
    void dt;
    void ctx;
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
    this.ctx = null;
  }

  /** The landmark's footprint and affordances; called once, lazily, without a scene. */
  protected abstract describe(): LandmarkShape;

  /** Populates `group` with meshes. Called once, from `init`. */
  protected abstract build(ctx: WorldContext): void;
}

export interface LandmarkShape {
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];
}

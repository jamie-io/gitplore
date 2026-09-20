import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { PlayerController } from '@engine/player/player-controller';
import { PlayerVisual } from '@engine/player/player-visual';
import { WorldContext, WorldObject, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Explorer } from '../avatar/explorer';
import { Environment } from '../environments/environment';
import { CommitRidge } from '../environments/data/commit-ridge';
import { LanguagePillars, languageSideOffset } from '../environments/data/language-pillars';
import { ReleaseMarkers } from '../environments/data/release-markers';
import { StarLanterns } from '../environments/data/star-lanterns';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import { ScreenLandmark } from '../landmarks/base/screen.landmark';
import { ReturnPortal } from './return.landmark';

/** Anything a project scene owns: it may block, it may offer, and it is disposed with the scene. */
export interface SceneObject extends WorldObject {
  readonly colliders?: readonly Collider[];
  readonly interactables?: readonly Interactable[];
}

/**
 * A demo the visitor plays inside the world rather than in the panel (§5's "in-world" demo mode).
 * The scene owns it; the `SceneDirector` drives it, which is why it is not a `Landmark` any more —
 * a demo is a thing you use, not a place you walk to.
 */
export interface InWorldDemo {
  /** What the HUD tells the visitor while the demo runs. */
  readonly demoHint: string;
  enter(player: PlayerController): void;
  interact(): void;
  exit(): void;
}

export interface ProjectSceneOptions {
  readonly environment: Environment;
  readonly project: Project;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  /** The exhibit was used; the page turns this into the `/p/:slug/info` route. */
  readonly onOpenInfo: (project: Project) => void;
  /** The return portal was used; the page turns this into `/`. */
  readonly onLeave: () => void;
  /** The visitor asked to start this world's in-world demo; the director hands it the controls. */
  readonly onDemo?: () => void;
  readonly textures?: TextureProvider;
}

/**
 * One repository's own world (spec §5): the environment carries the atmosphere, the exhibit board
 * carries the screenshot and opens the panel, and the return portal leads back to the start world.
 *
 * Bespoke scenes under `world/projects/<slug>/` extend this and call `add()` in their constructor;
 * everything else about them is inherited.
 */
export class ProjectScene implements WorldScene {
  readonly id: string;
  readonly landmarks: readonly Landmark[];
  /** Where the director puts the player on arrival, and which way they look. */
  readonly arrival: { readonly position: Vector3; readonly yaw: number };

  /** Built with the world and disposed with it, cut from this environment's own accent. */
  private readonly explorer: Explorer;

  protected readonly environment: Environment;
  protected readonly project: Project;
  protected readonly returnPortal: ReturnPortal;
  protected readonly exhibit: ScreenLandmark;

  private readonly parts: SceneObject[];
  private cachedColliders: readonly Collider[] | null = null;
  private cachedInteractables: readonly Interactable[] | null = null;

  constructor(options: ProjectSceneOptions) {
    this.environment = options.environment;
    this.project = options.project;
    this.id = `project:${options.project.slug}`;
    this.explorer = new Explorer({
      mood: options.environment.mood,
      reducedMotion: options.reducedMotion,
    });

    const [anchor] = this.environment.anchors(1);
    this.exhibit = new ScreenLandmark({
      project: options.project,
      placement: anchor,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: options.onOpenInfo,
      textures: options.textures,
    });

    // Turned to face the arriving player's back: `Landmark` then derives a spawn point a few
    // metres in front of it and a yaw pointing away, which is exactly "the exit is behind you".
    // `Landmark.spawnYaw` already adds one `Math.PI` to `rotationY`; subtracting it here (rather
    // than adding, which `sin`/`cos` would make physically identical but numerically 2π off)
    // keeps `arrival.yaw` exactly equal to `environment.spawnYaw` instead of `+ 2π`.
    const back: LandmarkPlacement = {
      position: [this.environment.spawn.x, 0, this.environment.spawn.z],
      rotationY: this.environment.spawnYaw - Math.PI,
    };
    this.returnPortal = new ReturnPortal({
      project: options.project,
      placement: back,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: () => options.onLeave(),
      textures: options.textures,
    });

    this.arrival = { position: this.returnPortal.spawn, yaw: this.returnPortal.spawnYaw };
    this.landmarks = [this.exhibit, this.returnPortal];
    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );
    const dataOrigin = this.arrival.position
      .clone()
      .lerp(this.exhibit.position, 0.5)
      .addScaledVector(side, languageSideOffset(options.project));
    this.parts = [
      this.exhibit,
      this.returnPortal,
      new CommitRidge({
        project: options.project,
        from: this.arrival.position,
        to: this.exhibit.position,
        ground: this.environment.ground,
      }),
      new LanguagePillars({
        project: options.project,
        origin: dataOrigin,
        rotationY: this.exhibit.rotationY,
        ground: this.environment.ground,
      }),
      new ReleaseMarkers({
        project: options.project,
        from: this.arrival.position,
        to: this.exhibit.position,
        ground: this.environment.ground,
      }),
      new StarLanterns({
        project: options.project,
        from: this.arrival.position,
        to: this.exhibit.position,
        reducedMotion: options.reducedMotion,
      }),
    ];
  }

  /**
   * The in-world demo this world offers, if it has one. A getter rather than a field so a bespoke
   * scene can override it without depending on the order class fields are initialised in: a
   * subclass (Task 6's DeslopifyScene) overrides it with its own `get demo()`, which a field on
   * this base class cannot be safely replaced by.
   */
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get demo(): InWorldDemo | null {
    return null;
  }

  /** Adds a bespoke object. Call from a subclass constructor only: shapes are read after that. */
  protected add(object: SceneObject): void {
    this.parts.push(object);
    this.cachedColliders = null;
    this.cachedInteractables = null;
  }

  /** The engine drives the figure through `PlayerVisual` alone and never names the Explorer. */
  get avatar(): PlayerVisual {
    return this.explorer;
  }

  get ground() {
    return this.environment.ground;
  }

  // Cached rather than recomputed: the render loop reads both every frame, and rebuilding two
  // arrays per frame would allocate for nothing. `add` clears the cache.
  get colliders(): readonly Collider[] {
    return (this.cachedColliders ??= [
      ...this.environment.colliders,
      ...this.parts.flatMap((part) => part.colliders ?? []),
    ]);
  }

  get interactables(): readonly Interactable[] {
    return (this.cachedInteractables ??= this.parts.flatMap((part) => part.interactables ?? []));
  }

  init(ctx: WorldContext): void {
    this.environment.init(ctx);
    this.parts.forEach((part) => part.init(ctx));
    this.explorer.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.environment.update(dt, ctx);
    this.parts.forEach((part) => part.update(dt, ctx));
  }

  dispose(): void {
    this.parts.forEach((part) => part.dispose());
    this.explorer.dispose();
    this.environment.dispose();
  }
}

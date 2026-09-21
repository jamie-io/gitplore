import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { PlayerVisual } from '@engine/player/player-visual';
import { WorldContext, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Explorer } from '../avatar/explorer';
import { Environment } from '../environments/environment';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import { createLandmark } from '../landmarks/create-landmark';
import { HomeBase } from './home-base';

/** Within this distance of a landmark the HUD names the project instead of the place. */
const AREA_RADIUS = 10;

export interface HubSceneOptions {
  /** The surroundings. The scene owns the projects in them, nothing else. */
  readonly environment: Environment;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  readonly projects: readonly Project[];
  readonly onEnter: (project: Project) => void;
  readonly onAreaChange?: (area: string) => void;
  /** The camp's contact obelisk opens the contact dialog through this. */
  readonly onContact?: () => void;
  readonly textures?: TextureProvider;
}

/**
 * The world the visitor starts in: one landmark per project, standing in whatever environment it
 * was handed. Unlike before, it is disposed when the visitor walks through a portal and built again
 * when they return (spec §2) — everything in it is procedural, and the models it does use are
 * refcounted by `AssetService`.
 */
export class HubScene implements WorldScene {
  readonly id = 'hub';

  readonly landmarks: readonly Landmark[];
  /** Jamie's camp around the spawn: who this portfolio belongs to, and how to reach him. */
  readonly homeBase: HomeBase;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  /** Built with the world and disposed with it, cut from this environment's own accent. */
  private readonly explorer: Explorer;

  private readonly environment: Environment;
  private readonly onAreaChange: ((area: string) => void) | undefined;
  private area: string | null = null;

  constructor(options: HubSceneOptions) {
    this.environment = options.environment;
    this.onAreaChange = options.onAreaChange;
    this.explorer = new Explorer({
      mood: options.environment.mood,
      reducedMotion: options.reducedMotion,
    });

    // Pinned landmarks are placed by hand and never move, so generated anchors have to work around
    // them: without this an anchor can land on top of one.
    const pinned = options.projects
      .map((project) => project.landmark.position)
      .filter((position) => position !== undefined);
    const anchors = this.environment.anchors(
      options.projects.filter((project) => !project.landmark.position).length,
      pinned,
    );
    let anchorIndex = 0;

    this.homeBase = new HomeBase({
      ground: this.environment.ground,
      mood: this.environment.mood,
      reducedMotion: options.reducedMotion,
      origin: this.environment.spawn,
      onContact: options.onContact,
    });
    this.environment.keepClear?.(this.homeBase.clearings);

    this.landmarks = options.projects.flatMap((project) => {
      const position = project.landmark.position;
      const placement: LandmarkPlacement | undefined = position
        ? { position, rotationY: project.landmark.rotationY ?? 0 }
        : anchors[anchorIndex++];

      if (!placement) {
        // A fixed front fan can run out of safe bearings. The environment deliberately returns no
        // replacement rather than stacking this project on a landmark already in the hub.
        return [];
      }

      return [
        createLandmark({
          project,
          placement,
          ground: this.environment.ground,
          reducedMotion: options.reducedMotion,
          onEnter: options.onEnter,
          textures: options.textures,
        }),
      ];
    });

    // Shapes are known before init (`Landmark.describe`), so the engine can read one flat list.
    this.colliders = [
      ...this.environment.colliders,
      ...this.landmarks.flatMap((landmark) => landmark.colliders),
      ...this.homeBase.colliders,
    ];
    this.interactables = [
      ...this.landmarks.flatMap((landmark) => landmark.interactables),
      ...this.homeBase.interactables,
    ];
  }

  /** The engine drives the figure through `PlayerVisual` alone and never names the Explorer. */
  get avatar(): PlayerVisual {
    return this.explorer;
  }

  get ground() {
    return this.environment.ground;
  }

  get spawn(): Vector3 {
    return this.environment.spawn;
  }

  get spawnYaw(): number {
    return this.environment.spawnYaw;
  }

  landmarkFor(slug: string): Landmark | undefined {
    return this.landmarks.find((landmark) => landmark.project.slug === slug);
  }

  init(ctx: WorldContext): void {
    this.environment.init(ctx);
    this.landmarks.forEach((landmark) => landmark.init(ctx));
    this.homeBase.init(ctx);
    this.explorer.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.environment.update(dt, ctx);
    this.landmarks.forEach((landmark) => landmark.update(dt, ctx));
    this.homeBase.update(dt, ctx);
    this.trackArea(ctx);
  }

  dispose(): void {
    this.landmarks.forEach((landmark) => landmark.dispose());
    this.homeBase.dispose();
    this.explorer.dispose();
    this.environment.dispose();
    this.area = null;
  }

  private trackArea(ctx: WorldContext): void {
    const { x, z } = ctx.player.position;
    let nearest: Landmark | null = null;
    let nearestDistance = AREA_RADIUS;

    for (const landmark of this.landmarks) {
      const distance = Math.hypot(landmark.position.x - x, landmark.position.z - z);
      if (distance < nearestDistance) {
        nearest = landmark;
        nearestDistance = distance;
      }
    }

    const area = nearest?.project.title ?? this.environment.name;
    if (area !== this.area) {
      this.area = area;
      this.onAreaChange?.(area);
    }
  }
}

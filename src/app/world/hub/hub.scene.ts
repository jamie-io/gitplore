import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import { createLandmark } from '../landmarks/create-landmark';
import { Monument } from './monument';
import { ringPlacements } from './placement';
import { Sky } from './sky';
import { Terrain } from './terrain';

/** Name of the open ground around the spawn. */
export const HUB_AREA = 'Lichtung';

/** Within this distance of a landmark the HUD names the project instead of the clearing. */
const AREA_RADIUS = 10;

export interface HubSceneOptions {
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  readonly projects: readonly Project[];
  readonly onEnter: (project: Project) => void;
  readonly onDemo?: (landmark: Landmark) => void;
  readonly onAreaChange?: (area: string) => void;
  readonly textures?: TextureProvider;
}

/**
 * The world the visitor starts in. It is created once and never destroyed: a project destination is
 * an overlay on top of it (IMPLEMENTATION_PLAN.md §3).
 */
export class HubScene implements WorldScene {
  readonly id = 'hub';

  readonly spawn = new Vector3(0, 0, 0);
  readonly landmarks: readonly Landmark[];
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly terrain = new Terrain();
  readonly monument = new Monument();
  private readonly sky: Sky;
  private readonly onAreaChange: ((area: string) => void) | undefined;
  private area: string | null = null;

  constructor(options: HubSceneOptions) {
    this.sky = new Sky(options);
    this.onAreaChange = options.onAreaChange;
    const ring = ringPlacements(
      options.projects.filter((project) => !project.landmark.position).length,
    );
    let ringIndex = 0;

    this.landmarks = options.projects.map((project) => {
      const pinned = project.landmark.position;
      const placement: LandmarkPlacement = pinned
        ? { position: pinned, rotationY: project.landmark.rotationY ?? 0 }
        : ring[ringIndex++];

      return createLandmark({
        project,
        placement,
        ground: this.terrain,
        reducedMotion: options.reducedMotion,
        onEnter: options.onEnter,
        onDemo: options.onDemo,
        textures: options.textures,
      });
    });
    // Shapes are known before init (`Landmark.describe`), so the engine can read one flat list.
    this.colliders = [
      ...this.monument.colliders,
      ...this.landmarks.flatMap((landmark) => landmark.colliders),
    ];
    this.interactables = this.landmarks.flatMap((landmark) => landmark.interactables);
  }

  get ground() {
    return this.terrain;
  }

  landmarkFor(slug: string): Landmark | undefined {
    return this.landmarks.find((landmark) => landmark.project.slug === slug);
  }

  init(ctx: WorldContext): void {
    this.terrain.init(ctx);
    this.sky.init(ctx);
    this.monument.init(ctx);
    this.landmarks.forEach((landmark) => landmark.init(ctx));
  }

  update(dt: number, ctx: WorldContext): void {
    this.terrain.update();
    this.sky.update(dt);
    this.landmarks.forEach((landmark) => landmark.update(dt, ctx));
    this.trackArea(ctx);
  }

  dispose(): void {
    this.landmarks.forEach((landmark) => landmark.dispose());
    this.monument.dispose();
    this.sky.dispose();
    this.terrain.dispose();
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

    const area = nearest?.project.title ?? HUB_AREA;
    if (area !== this.area) {
      this.area = area;
      this.onAreaChange?.(area);
    }
  }
}

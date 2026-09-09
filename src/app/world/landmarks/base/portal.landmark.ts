import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { createLabel } from './label';
import { Landmark, LandmarkShape } from './landmark';

/** Seconds the camera glides towards the portal before the destination opens. */
export const DOLLY_SECONDS = 0.35;

/** Metres within which a landmark's glTF model is fetched to replace its procedural proxy (§8). */
export const MODEL_LOAD_RADIUS = 40;

const PILLAR_RADIUS = 0.35;
const PILLAR_HEIGHT = 3.6;
const HALF_WIDTH = 1.4;
const INTERACT_RADIUS = 4;

/** Extra clearance so the player never clips a pillar. */
const PILLAR_COLLIDER_RADIUS = PILLAR_RADIUS + 0.1;

/**
 * A stone arch with a glowing surface in the project's colour. Using it glides the player into
 * the arch and opens the project (IMPLEMENTATION_PLAN.md §3).
 */
export class PortalLandmark extends Landmark {
  /** `from` is captured on the first frame of the glide, since only `update` sees the player. */
  private dolly: { elapsed: number; from: Vector3 | null } | null = null;

  /** The procedural arch; replaced by the glTF model once that has loaded. */
  private proxy: Group | null = null;
  private modelState: 'none' | 'loading' | 'loaded' = 'none';

  protected describe(): LandmarkShape {
    return {
      colliders: [-HALF_WIDTH, HALF_WIDTH].map((x) => {
        const world = this.toWorld(x, 0, 0);
        return { kind: 'cylinder', x: world.x, z: world.z, radius: PILLAR_COLLIDER_RADIUS };
      }),
      interactables: [
        {
          id: this.id,
          position: this.position.clone(),
          radius: INTERACT_RADIUS,
          prompt: `${this.project.title} betreten`,
          onInteract: () => this.use(),
        },
      ],
    };
  }

  protected build(ctx: WorldContext): void {
    const stone = new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9, flatShading: true });
    const glow = new MeshStandardMaterial({
      color: new Color(this.project.theme.primary),
      emissive: new Color(this.project.theme.primary),
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
    });

    // The stone parts live in their own group so a glTF model can take their place later.
    this.proxy = new Group();
    this.proxy.name = 'proxy';
    const pillar = new CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS * 1.15, PILLAR_HEIGHT, 8);
    for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
      const mesh = new Mesh(pillar, stone);
      mesh.position.set(x, PILLAR_HEIGHT / 2, 0);
      mesh.castShadow = ctx.quality.shadows;
      this.proxy.add(mesh);
    }

    const lintel = new Mesh(new BoxGeometry(HALF_WIDTH * 2 + PILLAR_RADIUS * 2, 0.5, 0.9), stone);
    lintel.position.set(0, PILLAR_HEIGHT + 0.25, 0);
    lintel.castShadow = ctx.quality.shadows;
    this.proxy.add(lintel);
    this.group.add(this.proxy);

    const surface = new Mesh(new PlaneGeometry(HALF_WIDTH * 2 - 0.2, PILLAR_HEIGHT - 0.2), glow);
    surface.position.set(0, PILLAR_HEIGHT / 2, 0);
    this.group.add(surface);

    const label = createLabel(this.project.title, this.project.theme.primary);
    if (label) {
      label.position.set(0, PILLAR_HEIGHT + 1, 0.05);
      this.group.add(label);
    }
  }

  override update(dt: number, ctx: WorldContext): void {
    this.loadModelWhenNear(ctx);

    if (!this.dolly) {
      return;
    }

    const from = (this.dolly.from ??= ctx.player.position.clone());
    this.dolly.elapsed += dt;
    const t = Math.min(this.dolly.elapsed / DOLLY_SECONDS, 1);
    const eased = t * (2 - t);
    ctx.player.position.x = from.x + (this.position.x - from.x) * eased;
    ctx.player.position.z = from.z + (this.position.z - from.z) * eased;

    if (t >= 1) {
      this.dolly = null;
      this.onEnter(this.project);
    }
  }

  override dispose(): void {
    this.dolly = null;
    this.proxy = null;
    if (this.modelState === 'loaded' && this.project.landmark.model) {
      this.ctx?.assets.releaseModel(this.project.landmark.model);
    }
    this.modelState = 'none';
    super.dispose();
  }

  private loadModelWhenNear(ctx: WorldContext): void {
    const url = this.project.landmark.model;
    if (!url || this.modelState !== 'none') {
      return;
    }

    const { x, z } = ctx.player.position;
    if (Math.hypot(x - this.position.x, z - this.position.z) > MODEL_LOAD_RADIUS) {
      return;
    }

    this.modelState = 'loading';
    ctx.assets.model(url).then(
      (model) => this.placeModel(ctx, model, url),
      () => {
        // Keep the procedural arch; the next approach tries again.
        if (this.modelState === 'loading') {
          this.modelState = 'none';
        }
      },
    );
  }

  private placeModel(ctx: WorldContext, model: Group, url: string): void {
    if (this.modelState !== 'loading' || !this.ctx) {
      // Disposed meanwhile: hand the copy straight back.
      ctx.assets.releaseModel(url);
      return;
    }

    this.modelState = 'loaded';
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
      }
    });
    const holder = new Group();
    holder.name = 'model';
    holder.add(model);
    this.group.add(holder);

    if (this.proxy) {
      disposeObject3D(this.proxy);
      this.proxy = null;
    }
  }

  private use(): void {
    if (this.dolly) {
      return;
    }

    if (this.reducedMotion()) {
      this.onEnter(this.project);
      return;
    }

    this.dolly = { elapsed: 0, from: null };
  }
}

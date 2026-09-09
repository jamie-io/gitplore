import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { WorldContext } from '@engine/world-object';
import { createLabel } from './label';
import { Landmark, LandmarkShape } from './landmark';

/** Seconds the camera glides towards the portal before the destination opens. */
export const DOLLY_SECONDS = 0.35;

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
          onInteract: () => this.interact(),
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

    const pillar = new CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS * 1.15, PILLAR_HEIGHT, 8);
    for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
      const mesh = new Mesh(pillar, stone);
      mesh.position.set(x, PILLAR_HEIGHT / 2, 0);
      mesh.castShadow = ctx.quality.shadows;
      this.group.add(mesh);
    }

    const lintel = new Mesh(new BoxGeometry(HALF_WIDTH * 2 + PILLAR_RADIUS * 2, 0.5, 0.9), stone);
    lintel.position.set(0, PILLAR_HEIGHT + 0.25, 0);
    lintel.castShadow = ctx.quality.shadows;
    this.group.add(lintel);

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
    super.dispose();
  }

  private interact(): void {
    if (this.dolly) {
      return;
    }

    if (this.reducedMotion) {
      this.onEnter(this.project);
      return;
    }

    this.dolly = { elapsed: 0, from: null };
  }
}

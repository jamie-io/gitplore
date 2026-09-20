import { Mesh, Vector3 } from 'three';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { GALERIE } from '../mood';
import { Motes } from '../motes';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { createLabel } from '../../landmarks/base/label';

/** A high repository star count is still only this many points; empty worlds use path lamps. */
export const MAX_STAR_LANTERNS = 12;
export const PATH_LAMP_COUNT = 6;

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StarLanternsOptions {
  readonly project: Project;
  readonly from: Point3;
  readonly to: Point3;
  readonly reducedMotion: () => boolean;
}

/**
 * Floating points turn a non-zero star count into light. Every current repository has zero stars,
 * so the polished default is six calm path lamps; there is no empty black object waiting for data.
 * `Motes` owns glow selection for both the post stack and direct canvas path.
 */
export class StarLanterns implements WorldObject {
  readonly id = 'star-lanterns';

  private readonly shared = new SharedUniforms(GALERIE);
  private readonly motes: Motes;
  private label?: Mesh;

  constructor(private readonly options: StarLanternsOptions) {
    const midpoint = new Vector3(
      (options.from.x + options.to.x) / 2,
      (options.from.y + options.to.y) / 2,
      (options.from.z + options.to.z) / 2,
    );
    const radius = Math.max(
      3,
      Math.min(8, Math.hypot(options.to.x - options.from.x, options.to.z - options.from.z) / 2),
    );
    const stars = Math.max(0, Math.floor(options.project.stars ?? 0));
    const count = stars > 0 ? Math.min(stars, MAX_STAR_LANTERNS) : PATH_LAMP_COUNT;
    const lanterns = stars > 0;

    this.motes = new Motes({
      shared: this.shared,
      seed: seedFor(options.project.slug),
      count,
      area: {
        x: midpoint.x,
        z: midpoint.z,
        radius,
        minY: midpoint.y + (lanterns ? 2.4 : 1.6),
        maxY: midpoint.y + (lanterns ? 4.5 : 2.2),
      },
      followCamera: false,
      colour: lanterns ? 0xffd27a : 0xcfe7ff,
      size: lanterns ? 0.12 : 0.08,
      glow: lanterns ? 4 : 1.8,
      directGlow: lanterns ? 1.2 : 0.65,
      drift: lanterns ? 0.4 : 0.15,
      flicker: lanterns ? 0.65 : 0.15,
    });
  }

  init(ctx: WorldContext): void {
    const before = new Set(ctx.scene.children);
    this.motes.init(ctx);
    const points = ctx.scene.children.find((child) => !before.has(child));
    if (points) {
      points.name = this.id;
    }

    const text = (this.options.project.stars ?? 0) > 0 ? 'Sterne' : 'Wegbeleuchtung';
    const label = createLabel(text, this.options.project.theme.primary);
    if (label) {
      label.name = 'star-lanterns-label';
      const midpoint = new Vector3(
        (this.options.from.x + this.options.to.x) / 2,
        (this.options.from.y + this.options.to.y) / 2,
        (this.options.from.z + this.options.to.z) / 2,
      );
      label.position.set(midpoint.x, midpoint.y + 3.2, midpoint.z);
      this.label = label;
      ctx.scene.add(label);
    }
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.motes.update();
  }

  dispose(): void {
    this.motes.dispose();
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
  }
}

function seedFor(value: string): number {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

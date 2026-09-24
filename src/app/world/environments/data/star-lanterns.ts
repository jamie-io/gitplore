import { Group, Mesh, Vector3 } from 'three';
import type { Project } from '@content/project.model';
import type { QualitySettings } from '@engine/capability.service';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { GALERIE } from '../mood';
import { Motes } from '../motes';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { createLabel } from '../../landmarks/base/label';
import { createPlankSign } from './plank-sign';

/** A high repository star count is still only this many points; empty worlds use path lamps. */
export const MAX_STAR_LANTERNS = 12;
export const PATH_LAMP_COUNT = 6;

type ToySkin = 'default' | 'jungle';

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
  readonly skin?: ToySkin;
}

/**
 * Floating points turn a non-zero star count into light. Every current repository has zero stars,
 * so the polished default is six calm path lamps; the empty state has no label. Path lamps are
 * structural, so their count stays fixed on every quality tier. `Motes` owns glow selection for
 * both the post stack and direct canvas path.
 */
export class StarLanterns implements WorldObject {
  readonly id = 'star-lanterns';

  private readonly shared = new SharedUniforms(GALERIE);
  private motes?: Motes;
  private readonly stars: number;
  private readonly lanterns: boolean;
  private readonly midpoint: Vector3;
  private readonly radius: number;
  private label?: Mesh;
  private sign?: Group;

  constructor(private readonly options: StarLanternsOptions) {
    this.midpoint = new Vector3(
      (options.from.x + options.to.x) / 2,
      (options.from.y + options.to.y) / 2,
      (options.from.z + options.to.z) / 2,
    );
    this.radius = Math.max(
      3,
      Math.min(8, Math.hypot(options.to.x - options.from.x, options.to.z - options.from.z) / 2),
    );
    this.stars = Math.max(0, Math.floor(options.project.stars ?? 0));
    this.lanterns = this.stars > 0;
  }

  init(ctx: WorldContext): void {
    const jungle = this.options.skin === 'jungle';
    const target = Math.min(this.stars, MAX_STAR_LANTERNS);
    if (jungle && target === 0) {
      this.addLabel(ctx);
      return;
    }
    const count = jungle
      ? fixedMoteInput(target, ctx.quality)
      : this.lanterns
        ? target
        : fixedMoteInput(PATH_LAMP_COUNT, ctx.quality);
    this.motes = new Motes({
      shared: this.shared,
      seed: seedFor(this.options.project.slug),
      count,
      area: {
        x: this.midpoint.x,
        z: this.midpoint.z,
        radius: this.radius,
        minY: this.midpoint.y + (jungle || this.lanterns ? 2.4 : 1.6),
        maxY: this.midpoint.y + (jungle || this.lanterns ? 4.5 : 2.2),
      },
      followCamera: false,
      colour: jungle ? 0xe0a13c : this.lanterns ? 0xffd27a : 0xcfe7ff,
      size: jungle ? 0.16 : this.lanterns ? 0.12 : 0.08,
      glow: jungle || this.lanterns ? 4 : 1.8,
      directGlow: jungle || this.lanterns ? 1.2 : 0.65,
      drift: jungle || this.lanterns ? 0.4 : 0.15,
      flicker: jungle || this.lanterns ? 0.65 : 0.15,
    });

    const before = new Set(ctx.scene.children);
    this.motes.init(ctx);
    const points = ctx.scene.children.find((child) => !before.has(child));
    if (points) {
      points.name = this.id;
    }

    if (jungle || this.lanterns) {
      this.addLabel(ctx);
    }
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.motes?.update();
  }

  dispose(): void {
    this.motes?.dispose();
    this.motes = undefined;
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
    if (this.sign) {
      disposeObject3D(this.sign);
      this.sign = undefined;
    }
  }

  private addLabel(ctx: WorldContext): void {
    if (this.options.skin === 'jungle') {
      const sign = createPlankSign('Sterne · Fireflies', this.options.project.theme.primary);
      if (sign) {
        sign.name = 'star-lanterns-sign';
        sign.position.copy(this.midpoint);
        sign.rotation.y = facingYaw(this.options.from, this.options.to);
        this.sign = sign;
        ctx.scene.add(sign);
      }
      return;
    }

    const label = createLabel('Sterne', this.options.project.theme.primary);
    if (label) {
      label.name = 'star-lanterns-label';
      label.position.set(this.midpoint.x, this.midpoint.y + 3.2, this.midpoint.z);
      label.rotation.y = facingYaw(this.options.from, this.options.to);
      this.label = label;
      ctx.scene.add(label);
    }
  }
}

function fixedMoteInput(target: number, quality: QualitySettings): number {
  const density = quality.propDensity * (quality.shaderDetail === 0 ? 0.5 : 1);
  return Math.max(1, Math.round(target / density));
}

function facingYaw(from: Point3, to: Point3): number {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

function seedFor(value: string): number {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

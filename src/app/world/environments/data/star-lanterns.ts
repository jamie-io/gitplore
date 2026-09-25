import { BufferAttribute, Color, Mesh, Object3D, Points, ShaderMaterial, Vector3 } from 'three';
import type { Project } from '@content/project.model';
import type { QualitySettings } from '@engine/capability.service';
import { disposeObject3D } from '@engine/dispose';
import type { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { FIREFLY_GLADE } from '../jungle-layout';
import { GALERIE } from '../mood';
import { Motes } from '../motes';
import { between, seededRandom } from '../random';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { createLabel } from '../../landmarks/base/label';

/** A high repository star count is still only this many points; empty worlds use path lamps. */
export const MAX_STAR_LANTERNS = 12;
export const PATH_LAMP_COUNT = 6;

type ToySkin = 'default' | 'jungle';

/**
 * The jungle's firefly swarm over the exhibit glade (spec §4): how many, where they drift, how they
 * gather round a visitor carrying the lit lantern, and how the liana shakes them loose.
 */
export const SWARM = {
  count: 14,
  /** The low tier's: additive specks are what SwiftShader feels most. */
  lowCount: 8,
  /** Metres over the ground the fireflies drift between. */
  minY: 1.2,
  maxY: 3.2,
  /** Metres from the lit lantern within which a firefly leaves the glade for the visitor. */
  gatherReach: 11,
  /** How far a firefly gets towards its place round the visitor, or back home, per second. */
  gatherRate: 0.8,
  /** Metres from the visitor the gathered fireflies circle, and how fast, in radians a second. */
  orbit: { min: 1.1, max: 2.3 },
  orbitSpeed: 0.45,
  /** Metres over and under the visitor's eyes they circle at. */
  lift: { min: -0.7, max: 0.6 },
  /** Seconds the liana's burst takes to scatter the swarm and let it settle again. */
  burstSeconds: 1.25,
  /** Metres the burst throws each firefly outward at its widest, and how much of that upward. */
  burstReach: 3.5,
  burstRise: 0.4,
  /** The glow once Deslopify is installed, and the extra flash at the start of a burst. */
  bright: 1.7,
  flash: 1.5,
} as const;

/** A lit lantern on the ground plane. */
export interface SwarmLight {
  readonly x: number;
  readonly z: number;
}

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
  /** The ground under the jungle's swarm, so it drifts at the same height over a rise. */
  readonly ground?: HeightField;
}

/**
 * Floating points turn a non-zero star count into light. Every current repository has zero stars,
 * so the polished default is six calm path lamps; the empty state has no label. Path lamps are
 * structural, so their count stays fixed on every quality tier. `Motes` owns glow selection for
 * both the post stack and direct canvas path.
 *
 * The jungle's skin is no star count but the firefly swarm over the exhibit glade: fourteen of
 * them (eight on the low tier) drifting over `FIREFLY_GLADE`, gathering round the visitor while the
 * lit lantern comes within `SWARM.gatherReach`, scattering when the liana is pulled, and glowing
 * brighter once Deslopify is installed. The scene tells it the lantern, the pull and the install;
 * the swarm moves each firefly's base point on the CPU, and the shader's drift plays on top.
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
  private swarmState?: Swarm;

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
    if (this.options.skin === 'jungle') {
      this.initSwarm(ctx);
      return;
    }
    const target = Math.min(this.stars, MAX_STAR_LANTERNS);
    const count = this.lanterns ? target : fixedMoteInput(PATH_LAMP_COUNT, ctx.quality);
    this.motes = new Motes({
      shared: this.shared,
      seed: seedFor(this.options.project.slug),
      count,
      area: {
        x: this.midpoint.x,
        z: this.midpoint.z,
        radius: this.radius,
        minY: this.midpoint.y + (this.lanterns ? 2.4 : 1.6),
        maxY: this.midpoint.y + (this.lanterns ? 4.5 : 2.2),
      },
      followCamera: false,
      colour: this.lanterns ? 0xffd27a : 0xcfe7ff,
      size: this.lanterns ? 0.12 : 0.08,
      glow: this.lanterns ? 4 : 1.8,
      directGlow: this.lanterns ? 1.2 : 0.65,
      drift: this.lanterns ? 0.4 : 0.15,
      flicker: this.lanterns ? 0.65 : 0.15,
    });
    this.addMotes(ctx, this.motes);

    if (this.lanterns) {
      this.addLabel(ctx);
    }
  }

  update(dt: number, ctx: WorldContext): void {
    const reduced = this.options.reducedMotion();
    this.shared.update(dt, ctx.player.position, reduced);
    this.motes?.update();
    this.swarmState?.update(dt, ctx.player.position, reduced);
  }

  /** Where the lit lantern is, for the swarm to gather round the visitor; `null` while it is out. */
  setLantern(at: SwarmLight | null): void {
    this.swarmState?.setLantern(at);
  }

  /** The liana was pulled: the swarm scatters outward and settles again. */
  burst(): void {
    this.swarmState?.burst();
  }

  /** Brighter once Deslopify is installed, back to the slop's glow when it is not. */
  setBright(on: boolean): void {
    this.swarmState?.setBright(on);
  }

  /** Back over the glade, unscattered and dim, as on arrival. */
  resetSwarm(): void {
    this.swarmState?.reset();
  }

  dispose(): void {
    this.motes?.dispose();
    this.motes = undefined;
    this.swarmState = undefined;
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
  }

  /** The jungle's swarm: a fixed count over the glade, its base points moved by `Swarm`. */
  private initSwarm(ctx: WorldContext): void {
    const low = ctx.quality.shaderDetail === 0;
    const motes = new Motes({
      shared: this.shared,
      seed: seedFor(this.options.project.slug),
      count: fixedMoteInput(low ? SWARM.lowCount : SWARM.count, ctx.quality),
      area: {
        x: FIREFLY_GLADE.x,
        z: FIREFLY_GLADE.z,
        radius: FIREFLY_GLADE.rx,
        minY: SWARM.minY,
        maxY: SWARM.maxY,
      },
      followCamera: false,
      colour: 0xe0a13c,
      size: 0.16,
      glow: 4,
      directGlow: 1.2,
      drift: 0.4,
      flicker: 0.65,
    });
    this.motes = motes;
    const points = this.addMotes(ctx, motes);
    if (points instanceof Points) {
      this.swarmState = new Swarm(points, this.options.ground, seedFor(this.options.project.slug));
    }
  }

  /** Adds the motes to the scene and names their points after this object. */
  private addMotes(ctx: WorldContext, motes: Motes): Object3D | undefined {
    const before = new Set(ctx.scene.children);
    motes.init(ctx);
    const points = ctx.scene.children.find((child) => !before.has(child));
    if (points) {
      points.name = this.id;
    }
    return points;
  }

  private addLabel(ctx: WorldContext): void {
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

/**
 * The jungle's fireflies on the CPU: fourteen base points the shader's drift plays around. Each
 * has a home over the glade, a share of the way to its place circling the visitor (eased in while
 * the lit lantern is near, out again when it goes), and the burst's throw on top. Under reduced
 * motion they keep to their homes.
 */
class Swarm {
  private readonly attribute: BufferAttribute;
  private readonly colour: Color;
  private readonly baseColour: Color;
  private readonly homes: Float32Array;
  private readonly gathered: Float32Array;
  private readonly angles: Float32Array;
  private readonly radii: Float32Array;
  private readonly lifts: Float32Array;
  private lantern: SwarmLight | null = null;
  private bright = false;
  /** Seconds since the last burst began; past `SWARM.burstSeconds` there is none. */
  private burstAge: number = SWARM.burstSeconds;
  private clock = 0;
  /** Whether the points sit at their homes, so a still swarm uploads nothing. */
  private home = true;

  constructor(points: Points, ground: HeightField | undefined, seed: number) {
    this.attribute = points.geometry.getAttribute('position') as BufferAttribute;
    this.colour = (points.material as ShaderMaterial).uniforms['colour']!.value as Color;
    this.baseColour = this.colour.clone();
    // The swarm follows the visitor off the glade, so its bounds cannot be known ahead.
    points.frustumCulled = false;

    const count = this.attribute.count;
    const random = seededRandom(seed ^ 0x5eed);
    this.homes = new Float32Array(count * 3);
    this.gathered = new Float32Array(count);
    this.angles = new Float32Array(count);
    this.radii = new Float32Array(count);
    this.lifts = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform over the ellipse: the square root keeps the middle from crowding.
      const r = Math.sqrt(random());
      const angle = between(random, 0, Math.PI * 2);
      const x = FIREFLY_GLADE.x + Math.cos(angle) * r * FIREFLY_GLADE.rx;
      const z = FIREFLY_GLADE.z + Math.sin(angle) * r * FIREFLY_GLADE.rz;
      this.homes[i * 3] = x;
      this.homes[i * 3 + 1] =
        (ground?.heightAt(x, z) ?? 0) + between(random, SWARM.minY, SWARM.maxY);
      this.homes[i * 3 + 2] = z;
      this.angles[i] = (i / count) * Math.PI * 2 + between(random, -0.3, 0.3);
      this.radii[i] = between(random, SWARM.orbit.min, SWARM.orbit.max);
      this.lifts[i] = between(random, SWARM.lift.min, SWARM.lift.max);
    }
    (this.attribute.array as Float32Array).set(this.homes);
    this.attribute.needsUpdate = true;
  }

  setLantern(at: SwarmLight | null): void {
    this.lantern = at;
  }

  setBright(on: boolean): void {
    this.bright = on;
  }

  burst(): void {
    this.burstAge = 0;
  }

  reset(): void {
    this.lantern = null;
    this.bright = false;
    this.burstAge = SWARM.burstSeconds;
    this.gathered.fill(0);
  }

  update(dt: number, player: Vector3, reduced: boolean): void {
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (reduced) {
      this.gathered.fill(0);
      this.burstAge = SWARM.burstSeconds;
    } else {
      this.clock += seconds;
      this.burstAge = Math.min(SWARM.burstSeconds, this.burstAge + seconds);
    }
    const bursting = this.burstAge < SWARM.burstSeconds;
    const progress = this.burstAge / SWARM.burstSeconds;
    const flash = bursting ? 1 + SWARM.flash * (1 - progress) : 1;
    this.colour.copy(this.baseColour).multiplyScalar((this.bright ? SWARM.bright : 1) * flash);

    let moved = bursting;
    const lantern = this.lantern;
    for (let i = 0; i < this.gathered.length; i++) {
      const hx = this.homes[i * 3];
      const hz = this.homes[i * 3 + 2];
      const near =
        lantern !== null && Math.hypot(hx - lantern.x, hz - lantern.z) < SWARM.gatherReach;
      const step = SWARM.gatherRate * seconds;
      const share = reduced
        ? 0
        : Math.min(1, Math.max(0, this.gathered[i] + (near ? step : -step)));
      this.gathered[i] = share;
      moved ||= share > 0;
    }
    if (!moved) {
      if (!this.home) {
        (this.attribute.array as Float32Array).set(this.homes);
        this.attribute.needsUpdate = true;
        this.home = true;
      }
      return;
    }

    const array = this.attribute.array as Float32Array;
    // Out and back again in one smooth arc, widest half way through.
    const thrown = bursting ? Math.sin(Math.PI * progress) * SWARM.burstReach : 0;
    for (let i = 0; i < this.gathered.length; i++) {
      const g = this.gathered[i];
      const eased = g * g * (3 - 2 * g);
      const angle = this.angles[i] + this.clock * SWARM.orbitSpeed;
      const ox = player.x + Math.cos(angle) * this.radii[i];
      const oz = player.z + Math.sin(angle) * this.radii[i];
      const oy = player.y + this.lifts[i];
      let x = this.homes[i * 3] + (ox - this.homes[i * 3]) * eased;
      let y = this.homes[i * 3 + 1] + (oy - this.homes[i * 3 + 1]) * eased;
      let z = this.homes[i * 3 + 2] + (oz - this.homes[i * 3 + 2]) * eased;
      if (thrown > 0) {
        // Away from the middle of wherever the swarm is: the glade, or the visitor it circles.
        const cx = FIREFLY_GLADE.x + (player.x - FIREFLY_GLADE.x) * eased;
        const cz = FIREFLY_GLADE.z + (player.z - FIREFLY_GLADE.z) * eased;
        let dx = x - cx;
        let dz = z - cz;
        const length = Math.hypot(dx, dz);
        if (length > 1e-3) {
          dx /= length;
          dz /= length;
        } else {
          dx = Math.cos(this.angles[i]);
          dz = Math.sin(this.angles[i]);
        }
        x += dx * thrown;
        y += thrown * SWARM.burstRise;
        z += dz * thrown;
      }
      array[i * 3] = x;
      array[i * 3 + 1] = y;
      array[i * 3 + 2] = z;
    }
    this.attribute.needsUpdate = true;
    this.home = false;
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

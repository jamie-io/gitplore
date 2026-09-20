import {
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { between, seededRandom } from '../random';

export type CreatureBehavior = 'wander' | 'follow';
export type CreatureKind = 'bird' | 'fish' | 'cat';

export interface CreatureOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly ground: HeightField;
  readonly seed: number;
  readonly behavior: CreatureBehavior;
  readonly kind?: CreatureKind;
  readonly radius?: number;
  readonly speed?: number;
  readonly reducedMotion?: () => boolean;
}

/** One deterministic low-poly agent, used for wandering life or a nearby cat that follows. */
export class Creature implements WorldObject {
  readonly id: string;
  readonly radius: number;
  readonly position: Vector3;

  private readonly group = new Group();
  private readonly options: CreatureOptions;
  private readonly origin: Vector3;
  private readonly random;
  private readonly target = new Vector3();
  private targetTime = 0;
  private following = false;

  constructor(options: CreatureOptions) {
    this.options = options;
    this.id = options.id;
    this.radius = options.radius ?? 8;
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.origin = this.position.clone();
    this.random = seededRandom(options.seed);
    this.group.name = this.id;
    this.group.position.copy(this.position);
  }

  init(ctx: WorldContext): void {
    const kind = this.options.kind ?? 'bird';
    const colours: Record<CreatureKind, number> = {
      bird: 0xe7c665,
      fish: 0x5da7b4,
      cat: 0xb7835e,
    };
    const body = new Mesh(
      new IcosahedronGeometry(kind === 'cat' ? 0.32 : 0.24, 0),
      new MeshStandardMaterial({ color: colours[kind], roughness: 0.82 }),
    );
    body.name = `${this.id}:body`;
    body.position.y = kind === 'bird' ? 1.8 : kind === 'fish' ? 0.7 : 0.35;
    body.castShadow = ctx.quality.shadows;
    this.group.add(body);
    if (kind !== 'cat') {
      const fin = new Mesh(
        new ConeGeometry(0.14, 0.32, 4),
        new MeshStandardMaterial({ color: colours[kind], roughness: 0.82 }),
      );
      fin.name = `${this.id}:fin`;
      fin.position.set(0, body.position.y, 0.28);
      fin.rotation.x = Math.PI / 2;
      fin.castShadow = ctx.quality.shadows;
      this.group.add(fin);
    }
    ctx.scene.add(this.group);
  }

  update(dt: number, ctx: WorldContext): void {
    if (this.options.reducedMotion?.()) {
      return;
    }

    const playerDistance = Math.hypot(
      ctx.player.position.x - this.position.x,
      ctx.player.position.z - this.position.z,
    );
    const shouldFollow = this.options.behavior === 'follow' && playerDistance <= this.radius;
    if (shouldFollow) {
      if (!this.following) {
        this.following = true;
      }
      this.target.set(ctx.player.position.x, this.position.y, ctx.player.position.z);
      this.targetTime = 0;
    } else {
      if (this.following) {
        this.following = false;
        this.targetTime = 0;
        this.chooseWanderTarget();
      } else {
        this.targetTime -= dt;
        if (this.targetTime <= 0 || this.horizontalDistanceToTarget() < 0.3) {
          this.chooseWanderTarget();
        }
      }
    }

    const stopDistance = shouldFollow ? 1.6 : 0;
    const distance = this.horizontalDistanceToTarget();
    if (distance <= stopDistance) {
      return;
    }

    const step = Math.min(distance, (this.options.speed ?? 1.2) * dt);
    const dx = (this.target.x - this.position.x) / distance;
    const dz = (this.target.z - this.position.z) / distance;
    this.position.x += dx * step;
    this.position.z += dz * step;
    this.position.y = this.options.ground.heightAt(this.position.x, this.position.z);
    this.group.position.copy(this.position);
    this.group.rotation.y = Math.atan2(dx, -dz);
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
  }

  private chooseWanderTarget(): void {
    const angle = between(this.random, 0, Math.PI * 2);
    const distance = between(this.random, 2, 6);
    this.target.set(
      this.origin.x + Math.cos(angle) * distance,
      this.origin.y,
      this.origin.z + Math.sin(angle) * distance,
    );
    this.target.y = this.options.ground.heightAt(this.target.x, this.target.z);
    this.targetTime = between(this.random, 1.5, 4);
  }

  private horizontalDistanceToTarget(): number {
    return Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z);
  }
}

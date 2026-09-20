import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { PlayerController } from '@engine/player/player-controller';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';

const INTERACT_RADIUS = 2.5;
const WIDTH = 1.2;
const HEIGHT = 2.2;
const DEPTH = 0.16;

export interface DoorOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly reducedMotion?: () => boolean;
}

/** A door that cannot close until the visitor has cleared its interaction radius. */
export class Door implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly leaf = new Group();
  private readonly options: DoorOptions;
  private readonly collider: MutableCollider;
  private player: PlayerController | null = null;
  private openValue = false;
  private angle = 0;

  constructor(options: DoorOptions) {
    this.options = options;
    this.id = options.id;
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = options.rotationY ?? 0;
    this.collider = {
      kind: 'aabb',
      minX: this.position.x - WIDTH / 2,
      maxX: this.position.x + WIDTH / 2,
      minZ: this.position.z - DEPTH / 2,
      maxZ: this.position.z + DEPTH / 2,
      enabled: true,
    };
    this.colliders = [this.collider];
    this.interactables = [
      {
        id: `${this.id}:open`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Tür öffnen',
        onInteract: () => this.toggle(),
      },
    ];
  }

  get open(): boolean {
    return this.openValue;
  }

  init(ctx: WorldContext): void {
    const frame = new Mesh(
      new BoxGeometry(WIDTH + 0.3, HEIGHT + 0.25, 0.18),
      new MeshStandardMaterial({ color: 0x59616a, roughness: 0.75 }),
    );
    frame.name = `${this.id}:frame`;
    frame.position.y = HEIGHT / 2;
    frame.castShadow = ctx.quality.shadows;
    this.group.add(frame);

    const slab = new Mesh(
      new BoxGeometry(WIDTH, HEIGHT, DEPTH),
      new MeshStandardMaterial({ color: 0x8d6247, roughness: 0.8 }),
    );
    slab.name = `${this.id}:leaf`;
    slab.position.set(WIDTH / 2, HEIGHT / 2, 0);
    slab.castShadow = ctx.quality.shadows;
    this.leaf.position.x = -WIDTH / 2;
    this.leaf.add(slab);
    this.group.add(this.leaf);
    ctx.scene.add(this.group);
  }

  update(dt: number, ctx: WorldContext): void {
    this.player = ctx.player;
    if (this.isVisitorInside()) {
      this.setOpen(true);
    } else if (this.openValue) {
      this.setOpen(false);
    }

    const target = this.openValue ? -Math.PI / 2 : 0;
    this.angle = this.options.reducedMotion?.() ? target : approach(this.angle, target, dt * 3.5);
    this.leaf.rotation.y = this.angle;
  }

  dispose(): void {
    this.player = null;
    disposeObject3D(this.group);
    this.group.clear();
    this.leaf.clear();
  }

  private toggle(): void {
    if (this.openValue && this.isVisitorInside()) {
      return;
    }
    this.setOpen(!this.openValue);
  }

  private setOpen(open: boolean): void {
    this.openValue = open;
    this.collider.enabled = !open;
  }

  private isVisitorInside(): boolean {
    if (!this.player) {
      return false;
    }
    return Math.hypot(
      this.player.position.x - this.position.x,
      this.player.position.z - this.position.z,
    ) <= INTERACT_RADIUS;
  }
}

type MutableCollider = Extract<Collider, { kind: 'aabb' }> & { enabled: boolean };

function approach(value: number, target: number, amount: number): number {
  if (Math.abs(target - value) <= amount) {
    return target;
  }
  return value + Math.sign(target - value) * amount;
}

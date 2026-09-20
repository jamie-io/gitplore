import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Interactable } from '@engine/interaction/interactable';

const INTERACT_RADIUS = 2.6;
const BASE_RADIUS = 0.42;
const BASE_HEIGHT = 0.55;

export interface LeverOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly onToggle?: (active: boolean) => void;
  readonly reducedMotion?: () => boolean;
}

/** A reusable floor lever with one fixed footprint and a visible on/off state. */
export class Lever implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly options: LeverOptions;
  private handle: Group | null = null;
  private activeValue = false;
  private angle = 0;

  constructor(options: LeverOptions) {
    this.options = options;
    this.id = options.id;
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = options.rotationY ?? 0;
    this.colliders = [
      { kind: 'cylinder', x: this.position.x, z: this.position.z, radius: BASE_RADIUS },
    ];
    this.interactables = [
      {
        id: `${this.id}:toggle`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Hebel betätigen',
        onInteract: () => this.toggle(),
      },
    ];
  }

  get active(): boolean {
    return this.activeValue;
  }

  init(ctx: WorldContext): void {
    const base = new Mesh(
      new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.15, BASE_HEIGHT, 8),
      new MeshStandardMaterial({ color: 0x4d5561, roughness: 0.75 }),
    );
    base.name = `${this.id}:base`;
    base.position.y = BASE_HEIGHT / 2;
    base.castShadow = ctx.quality.shadows;
    this.group.add(base);

    const pivot = new Group();
    pivot.name = `${this.id}:handle`;
    pivot.position.y = BASE_HEIGHT;
    const stem = new Mesh(
      new BoxGeometry(0.08, 0.65, 0.08),
      new MeshStandardMaterial({ color: 0xc4cbd3, metalness: 0.35, roughness: 0.45 }),
    );
    stem.position.y = 0.325;
    const grip = new Mesh(
      new CylinderGeometry(0.11, 0.11, 0.3, 8),
      new MeshStandardMaterial({ color: 0xd55b42, roughness: 0.55 }),
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.65, 0);
    pivot.add(stem, grip);
    this.handle = pivot;
    this.group.add(pivot);

    ctx.scene.add(this.group);
  }

  update(dt: number): void {
    const target = this.activeValue ? -0.65 : 0;
    this.angle = this.options.reducedMotion?.() ? target : approach(this.angle, target, dt * 5);
    if (this.handle) {
      this.handle.rotation.z = this.angle;
    }
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
    this.handle = null;
  }

  private toggle(): void {
    this.activeValue = !this.activeValue;
    this.options.onToggle?.(this.activeValue);
  }
}

function approach(value: number, target: number, amount: number): number {
  if (Math.abs(target - value) <= amount) {
    return target;
  }
  return value + Math.sign(target - value) * amount;
}

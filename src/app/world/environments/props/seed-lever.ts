import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';

const INTERACT_RADIUS = 2.8;
const BASE_RADIUS = 0.42;
const BASE_HEIGHT = 0.55;
/** How far the handle throws, and how long it stays down before it springs back. */
const THROW = -0.65;
const HOLD_SECONDS = 0.35;

/** What the HUD offers at the lever. */
export const SEED_LEVER_PROMPT = 'Dekoration neu würfeln';

export interface SeedLeverOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  /** Called with 1 on the first pull, 2 on the second, and so on; never stored anywhere. */
  readonly onReseed: (offset: number) => void;
  readonly reducedMotion?: () => boolean;
}

/**
 * A lever that scatters the world's decoration again: the n-th pull asks for seed offset n. The
 * count lives in this object alone, so it goes when the world is rebuilt and the next visitor, or
 * the same one coming back, starts from the world everybody links to.
 */
export class SeedLever implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly options: SeedLeverOptions;
  private handle: Group | null = null;
  private pullCount = 0;
  private angle = 0;
  private hold = 0;

  constructor(options: SeedLeverOptions) {
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
        id: `${this.id}:pull`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: SEED_LEVER_PROMPT,
        onInteract: () => this.pull(),
      },
    ];
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
      new MeshStandardMaterial({ color: 0x72b7a5, roughness: 0.55 }),
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.65, 0);
    pivot.add(stem, grip);
    this.handle = pivot;
    this.group.add(pivot);
    ctx.scene.add(this.group);
  }

  /** How often the lever has been pulled in this world. */
  get pulls(): number {
    return this.pullCount;
  }

  update(dt: number): void {
    // Reduced motion: the handle stays put, and the world changing is the whole answer.
    if (this.options.reducedMotion?.()) {
      this.hold = 0;
      this.angle = 0;
    } else {
      this.hold = Math.max(0, this.hold - dt);
      this.angle = approach(this.angle, this.hold > 0 ? THROW : 0, dt * (this.hold > 0 ? 9 : 4));
    }
    if (this.handle) {
      this.handle.rotation.z = this.angle;
    }
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
    this.handle = null;
  }

  private pull(): void {
    this.pullCount++;
    this.hold = HOLD_SECONDS;
    this.options.onReseed(this.pullCount);
  }
}

function approach(value: number, target: number, amount: number): number {
  if (Math.abs(target - value) <= amount) {
    return target;
  }
  return value + Math.sign(target - value) * amount;
}

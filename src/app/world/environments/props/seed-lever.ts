import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';
import { adoptNode } from '../model-geometry';
import type { HazedCopies } from '../shaders/hazed-copies';

const INTERACT_RADIUS = 2.8;
const BASE_RADIUS = 0.42;
const BASE_HEIGHT = 0.55;
/** How far the handle throws, and how long it stays down before it springs back. */
const THROW = -0.65;
const HOLD_SECONDS = 0.35;
const JUNGLE_BRANCH_Y = 2.35;
const JUNGLE_BRANCH_X = 0.25;
const JUNGLE_BRANCH_LENGTH = 1.25;
const JUNGLE_TRUNK_HEIGHT = 1.8;

/** What the HUD offers at the lever. */
export const SEED_LEVER_PROMPT = 'Dekoration neu würfeln';
export const JUNGLE_SEED_LEVER_PROMPT = 'Liane ziehen';
/**
 * The jungle lever, modelled in Blender (scripts/blender/models/liana_lever.py): a `liana-lever`
 * node (root rock, trunk and branch) and a `liana-handle` node built around the pivot the handle
 * swings on. The procedural lever stands until it arrives, and for good if it never does.
 */
export const LIANA_LEVER_MODEL = 'assets/models/liana-lever.glb';

export interface SeedLeverOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly skin?: 'default' | 'jungle';
  /** Called with 1 on the first pull, 2 on the second, and so on; never stored anywhere. */
  readonly onReseed: (offset: number) => void;
  readonly reducedMotion?: () => boolean;
  /** Hazes the jungle lever model into the environment's air; without it it stays plain. */
  readonly haze?: HazedCopies;
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
  readonly skin: 'default' | 'jungle';

  private readonly group = new Group();
  private readonly options: SeedLeverOptions;
  private handle: Group | null = null;
  /** The jungle lever's procedural parts, until the model replaces them. */
  private jungleProxy: Mesh[] = [];
  private model: Group | null = null;
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;
  private pullCount = 0;
  private angle = 0;
  private hold = 0;

  constructor(options: SeedLeverOptions) {
    this.options = options;
    this.id = options.id;
    this.skin = options.skin ?? 'default';
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
        prompt: this.skin === 'jungle' ? JUNGLE_SEED_LEVER_PROMPT : SEED_LEVER_PROMPT,
        onInteract: () => this.pull(),
      },
    ];
  }

  init(ctx: WorldContext): void {
    if (this.skin === 'jungle') {
      this.initJungle(ctx);
      return;
    }
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

  private initJungle(ctx: WorldContext): void {
    const rock = new Mesh(
      new DodecahedronGeometry(BASE_RADIUS, 0),
      new MeshStandardMaterial({ color: 0x26361f, roughness: 1 }),
    );
    rock.name = `${this.id}:base`;
    rock.position.y = BASE_HEIGHT / 2;
    rock.scale.y = 0.75;
    rock.castShadow = ctx.quality.shadows;

    const trunk = new Mesh(
      new CylinderGeometry(0.14, 0.18, JUNGLE_TRUNK_HEIGHT, 8),
      new MeshStandardMaterial({ color: 0x3a3226, roughness: 1 }),
    );
    trunk.name = `${this.id}:trunk`;
    trunk.position.y = BASE_HEIGHT + JUNGLE_TRUNK_HEIGHT / 2;
    trunk.castShadow = ctx.quality.shadows;

    const branch = new Mesh(
      new CylinderGeometry(0.09, 0.13, JUNGLE_BRANCH_LENGTH, 8),
      new MeshStandardMaterial({ color: 0x3a3226, roughness: 1 }),
    );
    branch.name = `${this.id}:branch`;
    branch.rotation.z = Math.PI / 2;
    branch.position.set(JUNGLE_BRANCH_X, JUNGLE_BRANCH_Y, 0);
    branch.castShadow = ctx.quality.shadows;

    const handle = new Group();
    handle.name = `${this.id}:handle`;
    handle.position.set(JUNGLE_BRANCH_X + JUNGLE_BRANCH_LENGTH / 2, JUNGLE_BRANCH_Y, 0);
    const liana = new Mesh(
      new CylinderGeometry(0.035, 0.055, 1.65, 8),
      new MeshStandardMaterial({ color: 0x356f45, roughness: 0.9 }),
    );
    liana.name = `${this.id}:liana`;
    liana.position.y = -0.825;
    liana.castShadow = ctx.quality.shadows;

    const grip = new Mesh(
      new SphereGeometry(0.11, 8, 6),
      new MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8 }),
    );
    grip.name = `${this.id}:liana-grip`;
    grip.position.y = -1.65;
    grip.castShadow = ctx.quality.shadows;

    handle.add(liana, grip);
    this.handle = handle;
    this.group.add(rock, trunk, branch, handle);
    ctx.scene.add(this.group);
    this.jungleProxy = [rock, trunk, branch, liana, grip];
    this.loadJungleModel(ctx);
  }

  /**
   * Swaps the procedural stump and liana for the model's: the stump into the lever's group, the
   * liana into the handle group, so it still swings about the same pivot.
   */
  private loadJungleModel(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    ctx.assets.model(LIANA_LEVER_MODEL).then(
      (model) => {
        const stump = model.getObjectByName('liana-lever');
        const liana = model.getObjectByName('liana-handle');
        if (this.disposed || this.model || !this.handle || !stump || !liana) {
          ctx.assets.releaseModel(LIANA_LEVER_MODEL);
          return;
        }
        this.model = model;
        this.jungleProxy.forEach(disposeObject3D);
        this.jungleProxy = [];
        const haze = this.options.haze;
        for (const node of [stump, liana]) {
          node.traverse((object) => {
            if (object instanceof Mesh) {
              object.castShadow = ctx.quality.shadows;
              if (haze) {
                object.material = haze.of(object.material as Material);
              }
            }
          });
        }
        // The stump is authored at the lever's foot, the liana at the pivot the handle swings on.
        this.group.add(stump);
        this.handle.add(adoptNode(liana, this.handle.position));
      },
      // A missing model is no error worth showing: the procedural lever stays.
      () => undefined,
    );
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
    this.disposed = true;
    if (this.model) {
      // The asset service owns the model's resources; `disposeObject3D` leaves them alone.
      this.model = null;
      this.assets?.releaseModel(LIANA_LEVER_MODEL);
    }
    this.jungleProxy = [];
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

import { Group, Material, Mesh, Vector3 } from 'three';
import type { AssetLike } from '@engine/asset.service';
import type { Collider } from '@engine/player/collision';
import type { WorldContext, WorldObject } from '@engine/world-object';
import { transformIn } from '../model-geometry';
import type { HazedCopies } from '../shaders/hazed-copies';

/**
 * The exhibit's easel, modelled in Blender (scripts/blender/models/exhibit_easel.py): a timber
 * frame whose opening, 3.4 × 2.4 m, stands round the exhibit's screen, marked by the empty
 * `screen_anchor` at its middle, facing +z.
 */
export const EXHIBIT_EASEL_MODEL = 'assets/models/exhibit-easel.glb';
export const SCREEN_ANCHOR = 'screen_anchor';

/**
 * The opening is exactly as wide as the screen's 3.4 m body, so the frame is widened this much
 * across: 10 cm of air either side, and the uprights never cut into the screen.
 */
export const EASEL_WIDEN = 1.06;

/** The uprights and the back legs' feet in the model's frame, x on either side, and their reach. */
const UPRIGHT = { x: 1.8, z: 0, radius: 0.16 } as const;
const BACK_FOOT = { x: 1.93, z: -1.35, radius: 0.2 } as const;

export interface ExhibitEaselOptions {
  /** The exhibit's foot on the ground. */
  readonly position: Vector3;
  /** The exhibit's turn: 0 faces +z. */
  readonly rotationY: number;
  /** Metres over the foot the screen's middle stands, where the anchor goes. */
  readonly screenCentre: number;
  readonly haze?: HazedCopies;
}

/**
 * The jungle's frame round the exhibit's screen. Only decoration: until the model arrives, and
 * for good if it never does, the exhibit stands on its own post as it does in every other world.
 * Its uprights and back legs block the visitor, so no one walks through the timber behind it.
 */
export class ExhibitEasel implements WorldObject {
  readonly id = 'exhibit-easel';
  readonly colliders: readonly Collider[];

  private readonly group = new Group();
  private model: Group | null = null;
  private assets: AssetLike | null = null;
  private disposed = false;

  constructor(private readonly options: ExhibitEaselOptions) {
    this.group.name = 'exhibit-easel';
    this.group.position.copy(options.position);
    this.group.rotation.y = options.rotationY;
    this.group.scale.x = EASEL_WIDEN;
    this.group.updateMatrixWorld(true);
    this.colliders = [UPRIGHT, BACK_FOOT].flatMap(({ x, z, radius }) =>
      [-1, 1].map((side) => {
        const at = this.group.localToWorld(new Vector3(side * x, 0, z));
        return { kind: 'cylinder' as const, x: at.x, z: at.z, radius };
      }),
    );
  }

  init(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    ctx.scene.add(this.group);
    const shadows = ctx.quality.shadows;
    // A missing model is no error worth showing: the exhibit simply stands on its own post.
    ctx.assets.model(EXHIBIT_EASEL_MODEL).then(
      (model) => this.place(model, shadows),
      () => undefined,
    );
  }

  update(): void {
    // Timber: nothing moves.
  }

  dispose(): void {
    this.disposed = true;
    if (this.model) {
      // The asset service owns the model's resources; only the reference goes.
      this.model = null;
      this.assets?.releaseModel(EXHIBIT_EASEL_MODEL);
    }
    this.group.removeFromParent();
    this.group.clear();
  }

  /** Stands the model so its anchor is at the screen's middle, hazed into the environment's air. */
  private place(model: Group, shadows: boolean): void {
    if (this.disposed || this.model) {
      this.assets?.releaseModel(EXHIBIT_EASEL_MODEL);
      return;
    }
    this.model = model;
    const haze = this.options.haze;
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = shadows;
        object.receiveShadow = shadows;
        if (haze) {
          object.material = haze.of(object.material as Material);
        }
      }
    });
    this.group.add(model);
    // The anchor wherever it hangs in the model's tree, in the easel group's own frame. Without
    // one the model stands as it comes: there is nothing to line up with the screen's middle.
    const node = model.getObjectByName(SCREEN_ANCHOR);
    if (!node) {
      return;
    }
    const anchor = new Vector3().setFromMatrixPosition(transformIn(node, this.group));
    model.position.add(new Vector3(0, this.options.screenCentre, 0).sub(anchor));
  }
}

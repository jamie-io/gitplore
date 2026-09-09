import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';

export const MONUMENT_MODEL = 'assets/models/monument.glb';

/** Radius of the monument's base plus a little clearance. */
const BASE_RADIUS = 3.6;

/**
 * The hub's hero landmark: a glTF obelisk at the centre of the clearing (IMPLEMENTATION_PLAN.md
 * §8). Its model is in the `core` group, so it is normally cached before the world appears; a
 * simple proxy block covers the gap if it is not.
 */
export class Monument implements WorldObject {
  readonly id = 'monument';
  readonly position: Vector3;
  readonly colliders: readonly Collider[];

  private root: Group | null = null;
  private proxy: Object3D | null = null;
  private loaded = false;
  private disposed = false;
  private assets: WorldContext['assets'] | null = null;

  constructor(position = new Vector3(0, 0, 9)) {
    this.position = position;
    this.colliders = [{ kind: 'cylinder', x: position.x, z: position.z, radius: BASE_RADIUS }];
  }

  init(ctx: WorldContext): void {
    this.assets = ctx.assets;
    this.disposed = false;

    this.proxy = new Mesh(
      new BoxGeometry(1.2, 8, 1.2),
      new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9 }),
    );
    this.proxy.name = 'monument-proxy';
    this.proxy.position.copy(this.position).setY(this.position.y + 4);
    ctx.scene.add(this.proxy);

    void ctx.assets.model(MONUMENT_MODEL).then((model) => this.place(ctx, model));
  }

  update(): void {
    // Static.
  }

  dispose(): void {
    this.disposed = true;
    if (this.proxy) {
      disposeObject3D(this.proxy);
      this.proxy = null;
    }
    if (this.root) {
      this.root.removeFromParent();
      this.root = null;
    }
    if (this.loaded) {
      this.assets?.releaseModel(MONUMENT_MODEL);
      this.loaded = false;
    }
  }

  private place(ctx: WorldContext, model: Group): void {
    if (this.disposed) {
      // Too late: hand the copy straight back.
      ctx.assets.releaseModel(MONUMENT_MODEL);
      return;
    }

    this.loaded = true;
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
        object.receiveShadow = ctx.quality.shadows;
      }
    });

    this.root = new Group();
    this.root.name = 'monument';
    this.root.position.copy(this.position);
    this.root.add(model);
    ctx.scene.add(this.root);

    if (this.proxy) {
      disposeObject3D(this.proxy);
      this.proxy = null;
    }
  }
}

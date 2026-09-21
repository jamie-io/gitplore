import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { createLabel } from '../landmarks/base/label';

/** Fixed behind-spawn location, beyond Lichtung's home-base clearance. */
export const LICHTUNG_SIGNPOST_POSITION = [0, 0, 24] as const;
/** The clear point immediately in front of the sign, used by placement tests and visitors. */
export const LICHTUNG_SIGNPOST_APPROACH = [0, 22.5] as const;

const SIGN_TEXT = 'Dieser Pfad führt nirgendwohin · HTTP 404';
const BOARD = { width: 3.8, height: 0.85, depth: 0.16 } as const;
export const SIGNPOST_LABEL_ROTATION_Y = Math.PI;

export function createSignpostLabel() {
  const label = createLabel(SIGN_TEXT, '#6b4528');
  if (label) {
    label.rotation.y = SIGNPOST_LABEL_ROTATION_Y;
  }
  return label;
}

/** A small dead-end marker behind the Lichtung arrival point. */
export class LichtungSignpost implements WorldObject {
  readonly id = 'lichtung-404-signpost';
  readonly position = new Vector3(...LICHTUNG_SIGNPOST_POSITION);
  /** The board hangs at head height, so it blocks across its whole width, not just at the pole. */
  readonly colliders: readonly Collider[] = [
    {
      kind: 'aabb',
      minX: LICHTUNG_SIGNPOST_POSITION[0] - BOARD.width / 2,
      maxX: LICHTUNG_SIGNPOST_POSITION[0] + BOARD.width / 2,
      minZ: LICHTUNG_SIGNPOST_POSITION[2] - BOARD.depth / 2,
      maxZ: LICHTUNG_SIGNPOST_POSITION[2] + BOARD.depth / 2,
    },
  ];

  private readonly group = new Group();
  private initialized = false;

  constructor(private readonly ground: HeightField) {
    this.group.name = this.id;
  }

  init(ctx: WorldContext): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.group.position.set(
      this.position.x,
      this.ground.heightAt(this.position.x, this.position.z),
      this.position.z,
    );

    const pole = new Mesh(
      new CylinderGeometry(0.14, 0.18, 2.2, 8),
      new MeshStandardMaterial({ color: 0x5b3824, roughness: 0.95 }),
    );
    pole.position.y = 1.1;
    pole.name = 'lichtung-404-pole';

    const board = new Mesh(
      new BoxGeometry(BOARD.width, BOARD.height, BOARD.depth),
      new MeshStandardMaterial({ color: 0x8b5e34, roughness: 0.9 }),
    );
    board.position.set(0, 1.85, 0);
    board.name = 'lichtung-404-board';

    const label = createSignpostLabel();
    if (label) {
      label.position.set(0, 1.85, -0.09);
      this.group.add(label);
    }

    this.group.add(pole, board);
    ctx.scene.add(this.group);
  }

  update(): void {
    // Static decoration.
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
    this.initialized = false;
  }
}

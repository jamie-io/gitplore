import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import type { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { createLabel } from '../../landmarks/base/label';
import { EXAMPLE_VIDEOS } from './video-wall';

const SIGN_POSITIONS = [
  [-6, -11],
  [6, -27],
  [-6, -34],
  [6, -41],
] as const;

export interface JungleSignsOptions {
  readonly ground?: HeightField;
}

/** Fixed jungle boards carrying Deslopify's real example pairs. */
export class JungleSigns implements WorldObject {
  readonly id = 'jungle-signs';
  readonly pairCount = EXAMPLE_VIDEOS.length;
  readonly positions = SIGN_POSITIONS.map(([x, z]) => new Vector3(x, 0, z));
  private readonly groups: Group[] = [];

  constructor(private readonly options: JungleSignsOptions = {}) {}

  init(ctx: WorldContext): void {
    EXAMPLE_VIDEOS.forEach((pair, index) => {
      const position = this.positions[index];
      const group = new Group();
      group.name = `jungle-sign:${index}`;
      group.position.set(
        position.x,
        this.options.ground?.heightAt(position.x, position.z) ?? 0,
        position.z,
      );

      const board = new Mesh(
        new BoxGeometry(2.8, 1.55, 0.14),
        new MeshStandardMaterial({ color: 0x5a3d27, roughness: 0.9 }),
      );
      board.name = `jungle-sign-board:${index}`;
      board.position.y = 1.05;
      board.castShadow = ctx.quality.shadows;
      board.receiveShadow = ctx.quality.shadows;
      group.add(board);

      const label = createLabel(`${pair.slop} → ${pair.original}`, '#5a3d27');
      if (label) {
        label.name = `jungle-sign-label:${index}`;
        label.position.set(0, 1.05, 0.08);
        group.add(label);
      }

      this.groups.push(group);
      ctx.scene.add(group);
    });
  }

  update(): void {
    // Signs are static scenery.
  }

  dispose(): void {
    this.groups.forEach(disposeObject3D);
    this.groups.length = 0;
  }
}

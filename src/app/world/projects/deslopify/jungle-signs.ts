import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeObject3D } from '@engine/dispose';
import type { Collider, HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { createLabel } from '../../landmarks/base/label';
import { EXAMPLE_VIDEOS } from './video-wall';

const SIGN_POSITIONS = [
  [-6, -11],
  [6, -27],
  [-6, -34],
  [6, -41],
] as const;
const BOARD = { width: 2.8, height: 1.55, depth: 0.14, centre: 1.05 } as const;
/** Posts stand just inside the board's ends and sink into the ground on a slope. */
const POST_X = BOARD.width / 2 - 0.2;

export interface JungleSignsOptions {
  readonly ground?: HeightField;
}

/** Fixed jungle boards carrying Deslopify's real example pairs. */
export class JungleSigns implements WorldObject {
  readonly id = 'jungle-signs';
  readonly pairCount = EXAMPLE_VIDEOS.length;
  readonly positions = SIGN_POSITIONS.map(([x, z]) => new Vector3(x, 0, z));
  readonly colliders: readonly Collider[] = SIGN_POSITIONS.map(([x, z]) => ({
    kind: 'aabb' as const,
    minX: x - BOARD.width / 2,
    maxX: x + BOARD.width / 2,
    minZ: z - BOARD.depth / 2,
    maxZ: z + BOARD.depth / 2,
  }));
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
        new BoxGeometry(BOARD.width, BOARD.height, BOARD.depth),
        new MeshStandardMaterial({ color: 0x5a3d27, roughness: 0.9 }),
      );
      board.name = `jungle-sign-board:${index}`;
      board.position.y = BOARD.centre;
      board.castShadow = ctx.quality.shadows;
      board.receiveShadow = ctx.quality.shadows;
      group.add(board);
      const postHeight = BOARD.centre + 0.6;
      const posts = new Mesh(
        mergeGeometries(
          [-1, 1].map((side) =>
            new CylinderGeometry(0.07, 0.08, postHeight, 6).translate(
              side * POST_X,
              postHeight / 2 - 0.6,
              -BOARD.depth,
            ),
          ),
        ),
        new MeshStandardMaterial({ color: 0x4a3120, roughness: 0.95 }),
      );
      posts.name = `jungle-sign-posts:${index}`;
      posts.castShadow = ctx.quality.shadows;
      group.add(posts);

      const label = createLabel(`${pair.slop} → ${pair.original}`, '#5a3d27');
      if (label) {
        label.name = `jungle-sign-label:${index}`;
        label.position.set(0, BOARD.centre, BOARD.depth / 2 + 0.01);
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

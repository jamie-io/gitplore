import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

/** Edge length of the walkable ground, in metres. */
export const TERRAIN_SIZE = 240;

/** Flat plateau around the spawn, so landmarks and the start area sit level. */
export const TERRAIN_FLAT_RADIUS = 14;

/** Largest absolute height the analytic function can produce. */
export const TERRAIN_MAX_HEIGHT = 5.5;

const SEGMENTS_HIGH = 160;
const SEGMENTS_LOW = 64;

/**
 * Analytic ground height. Three sine octaves rather than noise: it is cheap, deterministic, has no
 * table to ship, and the player controller can sample it directly instead of raycasting
 * (IMPLEMENTATION_PLAN.md §2).
 */
export function terrainHeightAt(x: number, z: number): number {
  const fade = plateauFade(Math.hypot(x, z));
  if (fade === 0) {
    return 0;
  }

  const relief =
    3.2 * Math.sin(x * 0.045) * Math.cos(z * 0.037) +
    1.6 * Math.sin((x + z) * 0.11) +
    0.7 * Math.sin(x * 0.23 + 1.7) * Math.sin(z * 0.19);

  return relief * fade;
}

/** 0 inside the flat radius, easing to 1 by twice that distance. */
function plateauFade(distance: number): number {
  const t = (distance - TERRAIN_FLAT_RADIUS) / TERRAIN_FLAT_RADIUS;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export class Terrain implements WorldObject, HeightField {
  readonly id = 'terrain';

  private mesh?: Mesh;

  heightAt(x: number, z: number): number {
    return terrainHeightAt(x, z);
  }

  init(ctx: WorldContext): void {
    const segments = ctx.quality.propDensity < 0.5 ? SEGMENTS_LOW : SEGMENTS_HIGH;
    const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, terrainHeightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    // Bake one normal per face instead of `flatShading`: the shader's screen-space derivatives
    // degenerate on the triangle that straddles the camera and painted it black under SwiftShader.
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    faceted.computeVertexNormals();

    this.mesh = new Mesh(
      faceted,
      new MeshStandardMaterial({
        color: 0x6c8f5a,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    this.mesh.receiveShadow = ctx.quality.shadows;
    ctx.scene.add(this.mesh);
  }

  update(): void {
    // Static ground: nothing moves.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}

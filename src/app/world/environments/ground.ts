import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

export interface GroundOptions {
  readonly id?: string;
  /** Edge length of the walkable ground, in metres. */
  readonly size: number;
  readonly color: number;
  /** Grid resolution on the strongest tier; halved on the weakest. 1 for flat ground. */
  readonly segments?: number;
  heightAt(x: number, z: number): number;
}

/**
 * An analytic height function turned into a faceted mesh, and the `HeightField` the player
 * controller samples. Three environments need exactly this with different numbers, which is why it
 * is a parameter object rather than four near-identical classes.
 */
export class ProceduralGround implements WorldObject, HeightField {
  readonly id: string;

  private mesh?: Mesh;

  constructor(private readonly options: GroundOptions) {
    this.id = options.id ?? 'ground';
  }

  heightAt(x: number, z: number): number {
    return this.options.heightAt(x, z);
  }

  init(ctx: WorldContext): void {
    const wanted = this.options.segments ?? 160;
    const segments = ctx.quality.propDensity < 0.5 ? Math.max(1, Math.round(wanted / 2.5)) : wanted;
    const geometry = new PlaneGeometry(this.options.size, this.options.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, this.options.heightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    // Bake one normal per face instead of `flatShading`: the shader's screen-space derivatives
    // degenerate on the triangle that straddles the camera and painted it black under SwiftShader.
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    faceted.computeVertexNormals();

    this.mesh = new Mesh(
      faceted,
      new MeshStandardMaterial({ color: this.options.color, roughness: 0.95, metalness: 0 }),
    );
    this.mesh.name = this.id;
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

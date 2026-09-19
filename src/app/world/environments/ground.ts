import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

export interface GroundOptions {
  readonly id?: string;
  /** Edge length of the walkable ground, in metres. */
  readonly size: number;
  /** The ground's colour when `colorAt` is absent. */
  readonly color: number;
  /** Grid resolution on the strongest tier; divided by 2.5 on the weakest. 1 for flat ground. */
  readonly segments?: number;
  heightAt(x: number, z: number): number;
  /**
   * Colour of one triangle, sampled at its centroid. `slope` is 0 on level ground and 1 on a
   * vertical face. The result is copied at once, so an implementation may reuse one instance.
   */
  colorAt?(x: number, z: number, height: number, slope: number): Color;
  /** Last word on the material before first use, e.g. to patch in the atmosphere shader. */
  decorate?(material: MeshStandardMaterial): void;
}

/**
 * An analytic height function turned into a faceted mesh, and the `HeightField` the player
 * controller samples. Several environments need exactly this with different numbers, which is why
 * it is a parameter object rather than near-identical classes.
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

    const colorAt = this.options.colorAt?.bind(this.options);
    if (colorAt) {
      faceted.setAttribute('color', faceColours(faceted, colorAt));
    }

    const material = new MeshStandardMaterial({
      color: colorAt ? 0xffffff : this.options.color,
      vertexColors: colorAt !== undefined,
      roughness: 0.95,
      metalness: 0,
    });
    this.options.decorate?.(material);

    this.mesh = new Mesh(faceted, material);
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

/** One colour per triangle, the same on all three corners, so faces stay crisp. */
function faceColours(
  geometry: BufferGeometry,
  colorAt: (x: number, z: number, height: number, slope: number) => Color,
): BufferAttribute {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colours = new Float32Array(position.count * 3);

  for (let face = 0; face < position.count; face += 3) {
    const x = (position.getX(face) + position.getX(face + 1) + position.getX(face + 2)) / 3;
    const y = (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3;
    const z = (position.getZ(face) + position.getZ(face + 1) + position.getZ(face + 2)) / 3;
    const slope = 1 - Math.abs(normal.getY(face));
    const colour = colorAt(x, z, y, slope);

    for (let corner = 0; corner < 3; corner++) {
      colours[(face + corner) * 3] = colour.r;
      colours[(face + corner) * 3 + 1] = colour.g;
      colours[(face + corner) * 3 + 2] = colour.b;
    }
  }

  return new BufferAttribute(colours, 3);
}

import {
  BufferAttribute,
  Color,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { QualitySettings } from '@engine/capability.service';
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
   * Colour at one grid corner; the GPU blends it across the triangles around it. `slope` is 0 on
   * level ground and 1 on a vertical face. The result is copied at once, so an implementation may
   * reuse one instance.
   */
  colorAt?(x: number, z: number, height: number, slope: number): Color;
  /**
   * Last word on the material before first use, e.g. to patch in the atmosphere shader; `quality`
   * is the tier the world was built on, for detail that only the stronger tiers can afford.
   */
  decorate?(material: MeshStandardMaterial, quality: QualitySettings): void;
}

/**
 * An analytic height function turned into a smooth mesh, and the `HeightField` the player
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
    // Indexed, so every corner is shared by the triangles around it and gets one averaged normal:
    // smooth light across the grid with no visible triangles. Vertex normals need no screen-space
    // derivatives, the thing that painted `flatShading` terrain black under SwiftShader.
    geometry.computeVertexNormals();

    const colorAt = this.options.colorAt?.bind(this.options);
    if (colorAt) {
      geometry.setAttribute(
        'color',
        cornerColours(position, geometry.getAttribute('normal'), colorAt),
      );
    }

    const material = new MeshStandardMaterial({
      color: colorAt ? 0xffffff : this.options.color,
      vertexColors: colorAt !== undefined,
      roughness: 0.95,
      metalness: 0,
    });
    this.options.decorate?.(material, ctx.quality);

    this.mesh = new Mesh(geometry, material);
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

/** One colour per grid corner, sampled where the corner stands. */
function cornerColours(
  position: BufferAttribute,
  normal: BufferAttribute | InterleavedBufferAttribute,
  colorAt: (x: number, z: number, height: number, slope: number) => Color,
): BufferAttribute {
  const colours = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const slope = 1 - Math.abs(normal.getY(i));
    const colour = colorAt(position.getX(i), position.getZ(i), position.getY(i), slope);
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }

  return new BufferAttribute(colours, 3);
}

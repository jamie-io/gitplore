import { DirectionalLight, HemisphereLight, Matrix4, Object3D, Vector3 } from 'three';
import type { QualitySettings } from '@engine/capability.service';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Mood } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface SunOptions {
  readonly mood: Mood;
  readonly shared: SharedUniforms;
}

/** Half the side of the orthographic shadow box, metres. */
const SHADOW_HALF_EXTENT = 40;
/** How far along the sun direction the light sits from the box's centre. */
const LIGHT_DISTANCE = 120;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 250;
/**
 * Depth offsets against acne on the faceted terrain: a small constant bias, and a normal offset
 * that grows with the slope so a facet lit at a grazing angle does not shadow itself.
 */
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.05;

const ORIGIN = new Vector3();

/**
 * The world's two lights: the sun as a shadow-casting directional light and the sky as a
 * hemisphere light. The hemisphere's ground colour is what lights the undersides of cones and
 * canopies, so it comes from the mood rather than being black.
 *
 * The shadow box is a fixed size and follows the visitor, snapped to whole shadow texels in light
 * space: a box that slid continuously would make every shadow edge crawl while walking.
 */
export class Sun implements WorldObject {
  readonly id = 'sun';
  /** Exposed for tests. */
  readonly light: DirectionalLight;

  private readonly hemisphere: HemisphereLight;
  /** The shared uniform's own vector, so the sun can never disagree with the shaders. */
  private readonly direction: Vector3;
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private texel = 0;

  constructor(options: SunOptions) {
    const { mood, shared } = options;

    this.direction = shared.sunDirection.value;
    this.light = new DirectionalLight(mood.sun.color, mood.sun.intensity);
    this.light.name = 'sun';
    this.light.target.name = 'sun-target';
    this.hemisphere = new HemisphereLight(
      mood.hemisphere.sky,
      mood.hemisphere.ground,
      mood.hemisphere.intensity,
    );
    this.hemisphere.name = 'sky-light';

    // The same basis the shadow camera builds when it looks from the light at its target, so
    // snapping happens on that camera's texel grid and not some other frame.
    const basis = new Matrix4().lookAt(this.direction, ORIGIN, Object3D.DEFAULT_UP);
    this.right.setFromMatrixColumn(basis, 0);
    this.up.setFromMatrixColumn(basis, 1);

    this.place(ORIGIN);
  }

  init(ctx: WorldContext): void {
    const { quality, scene } = ctx;
    const size = shadowMapSizeOf(quality);
    const { shadow } = this.light;

    this.light.castShadow = quality.shadows;
    shadow.mapSize.set(size, size);
    shadow.bias = SHADOW_BIAS;
    shadow.normalBias = SHADOW_NORMAL_BIAS;
    shadow.camera.left = -SHADOW_HALF_EXTENT;
    shadow.camera.right = SHADOW_HALF_EXTENT;
    shadow.camera.top = SHADOW_HALF_EXTENT;
    shadow.camera.bottom = -SHADOW_HALF_EXTENT;
    shadow.camera.near = SHADOW_NEAR;
    shadow.camera.far = SHADOW_FAR;
    shadow.camera.updateProjectionMatrix();
    this.texel = size > 0 ? (2 * SHADOW_HALF_EXTENT) / size : 0;

    scene.add(this.light, this.light.target, this.hemisphere);
    this.place(ctx.player.position);
  }

  update(_dt: number, ctx: WorldContext): void {
    this.place(ctx.player.position);
  }

  dispose(): void {
    // Frees the shadow map, which `disposeObject3D` would not find: it hangs off the light's
    // shadow, not the scene graph.
    this.light.dispose();
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.hemisphere.removeFromParent();
  }

  /** Centres the shadow box on `centre`, rounded to the texel grid of the light's own frame. */
  private place(centre: Vector3): void {
    const target = this.light.target.position;

    if (this.texel > 0) {
      const u = Math.round(centre.dot(this.right) / this.texel) * this.texel;
      const v = Math.round(centre.dot(this.up) / this.texel) * this.texel;
      const w = Math.round(centre.dot(this.direction) / this.texel) * this.texel;
      target
        .copy(this.right)
        .multiplyScalar(u)
        .addScaledVector(this.up, v)
        .addScaledVector(this.direction, w);
    } else {
      target.copy(centre);
    }

    this.light.position.copy(target).addScaledVector(this.direction, LIGHT_DISTANCE);
  }
}

/**
 * T2 adds `shadowMapSize` to `QualitySettings`. Until that lands here, the size is read off the
 * fields that already exist: no shadows means no map, the longest draw distance the largest one.
 */
function shadowMapSizeOf(quality: QualitySettings): number {
  const size = (quality as QualitySettings & { readonly shadowMapSize?: number }).shadowMapSize;
  return size ?? (quality.shadows ? (quality.fogFar >= 320 ? 2048 : 1024) : 0);
}

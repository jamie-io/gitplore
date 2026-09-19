import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

export interface LightPoolsOptions {
  readonly pools: readonly { readonly x: number; readonly z: number; readonly radius: number }[];
  readonly colour: number;
  readonly intensity: number;
}

/** Above the floor and any reflection lying on it, well inside the showroom's floor allowance. */
const POOL_Y = 0.01;

/**
 * A pool drawn straight to the screen is encoded to sRGB after it is added, which lifts a dark
 * floor about twice as much as the same light added to the strongest tier's linear HDR buffer.
 */
const DIRECT_SCALE = 0.55;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vPool;

void main() {
  vPool = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// A soft bell from the centre to nothing at the rim, with no texture and no exp: the software
// renderer behind the low tier pays for every instruction on every pixel a pool covers.
const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 colour;
uniform float intensity;
varying vec2 vPool;

void main() {
  float falloff = max(1.0 - dot(vPool, vPool), 0.0);
  gl_FragColor = vec4(colour * (intensity * falloff * falloff), 1.0);
  #include <colorspace_fragment>
}`;

/** Soft additive pools of light lying on the floor, under skylights and spots. */
export class LightPools implements WorldObject {
  readonly id = 'light-pools';

  private mesh: InstancedMesh | null = null;

  constructor(private readonly options: LightPoolsOptions) {}

  init(ctx: WorldContext): void {
    const { pools, colour, intensity } = this.options;
    const geometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const uniforms = {
      colour: { value: new Color(colour) },
      intensity: { value: intensity },
    };
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: AdditiveBlending,
      // Light, not a surface: never an occluder, and hidden from the ambient-occlusion re-render.
      depthWrite: false,
    });

    const mesh = new InstancedMesh(geometry, material, pools.length);
    mesh.name = 'light-pools';
    const matrix = new Matrix4();
    pools.forEach((pool, index) => {
      matrix.makeScale(pool.radius, 1, pool.radius).setPosition(pool.x, POOL_Y, pool.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.onBeforeRender = (renderer) => {
      uniforms.intensity.value = renderer.getRenderTarget() ? intensity : intensity * DIRECT_SCALE;
    };

    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(): void {
    // Static light.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = null;
    }
  }
}

import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface LightShaftOptions {
  readonly shared: SharedUniforms;
  /** Where each shaft meets the ground (world x, z), how wide it is there, and how far it rises. */
  readonly shafts: readonly {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
    readonly height: number;
  }[];
  readonly colour: number;
  /** Brightness of the core; above 1 the high tier's bloom catches it. */
  readonly intensity: number;
}

/**
 * How far below y = 0 the foot of every shaft is buried. The shafts know no terrain; buried this
 * deep, a beam reaches down into any hollow within 4 m instead of ending in mid-air above it, and
 * `GROUND_FADE` keeps the line where the floor cuts it from showing.
 */
const FOOT_DEPTH = 4;
/** Sides around the cylinder per `shaderDetail` tier. */
const SEGMENTS: readonly [number, number, number] = [10, 14, 20];
/** The gap in the canopy is narrower than the pool of light on the floor. */
const TOP_TAPER = 0.6;
/** Within this distance of the camera a shaft is gone: walking through one must never flash. */
const CAMERA_FADE = 3;
/**
 * World heights over which the beam fades in above the floor. The shafts know no terrain, so the
 * floor cuts the buried foot wherever it happens to lie; faded to almost nothing up to a couple of
 * metres above y = 0, that cut never shows as an outline, even on a rise and even over a dark
 * floor, where the post stack's linear blend makes any added light stand out most.
 */
const GROUND_FADE: readonly [number, number] = [0, 7];
/**
 * Opacity of one side at its core; the visitor sees the front and the back of a cylinder at once,
 * so the beam's centre line adds to about twice this, times `intensity`.
 */
const SIDE_OPACITY = 0.26;
/**
 * Gain without the post stack. There the beam is added straight onto the canvas, which holds
 * sRGB-encoded values, while the post stack adds it in linear light and encodes the sum. Encoding
 * the beam on its own would add far too much (the encoding is steepest near black), so it goes on
 * linear and scaled by the slope the encoding has over a hazy jungle's mid-bright background:
 * about 1 there, less for a whole beam's worth, since the curve flattens as the sum brightens.
 * This keeps a shaft about as strong on the medium tier as on the high one.
 */
const DIRECT_GAIN = 0.75;

const UP = new Vector3(0, 1, 0);

function gainFor(ctx: WorldContext): number {
  return ctx.quality.postProcessing ? 1 : DIRECT_GAIN;
}

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalWorld;
varying float vAlong;

void main() {
  mat4 frame = modelMatrix * instanceMatrix;
  vec4 world = frame * vec4(position, 1.0);
  vWorld = world.xyz;
  // The taper gives the side normals a little local Y, which the frame's height scale would
  // blow up thirty-fold; the horizontal part alone is what the silhouette fade needs, and a frame
  // that scales x and z alike keeps its direction without the inverse transpose.
  vNormalWorld = normalize(mat3(frame) * vec3(normal.x, 0.0, normal.z));
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Additive and never fogged: a beam is light in the air, not a surface behind it. Its brightness
// rises from the silhouette to the core through the view-facing normal, so the cylinder's edges
// are never seen, and it fades at both ends and right in front of the lens.
const FRAGMENT_SHADER = /* glsl */ `
${NOISE_GLSL}
uniform float time;
uniform vec3 colour;
uniform float intensity;
uniform float gain;
varying vec3 vWorld;
varying vec3 vNormalWorld;
varying float vAlong;

void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 viewDir = toCamera / max(dist, 1e-4);
  float facing = abs(dot(normalize(vNormalWorld), viewDir));
  // Across the beam's width w (0 core, 1 silhouette) facing is sqrt(1 − w²), so facing⁴ is
  // (1 − w²)²: it reaches zero at the silhouette with zero slope, and the tube never shows an edge.
  float core = facing * facing;
  core *= core;
  float ends = smoothstep(${GROUND_FADE[0].toFixed(2)}, ${GROUND_FADE[1].toFixed(2)}, vWorld.y) *
    (1.0 - smoothstep(0.55, 1.0, vAlong));
  float nearFade = smoothstep(${(CAMERA_FADE / 3).toFixed(2)}, ${CAMERA_FADE.toFixed(2)}, dist);

  float dust = 1.0;
  #if SHAFT_NOISE > 0
    // Slow blobs sliding down the beam, keyed on the world position so the seam of the cylinder's
    // texture never shows.
    vec2 q = vec2(dot(vWorld.xz, vec2(0.7, 0.7)) * 0.8, vAlong * 9.0 + time * 0.14);
    dust = 0.6 + 0.8 * noise2(q);
    #if SHAFT_NOISE > 1
      dust *= 0.75 + 0.5 * noise2(q * 2.6 + vec2(3.7, time * 0.21));
    #endif
  #endif

  float amount = core * ends * nearFade * dust * ${SIDE_OPACITY.toFixed(2)};
  gl_FragColor = vec4(colour * intensity * gain * amount, 1.0);
  #include <tonemapping_fragment>
  // No colour-space encoding on purpose: into the post stack's linear target it would be a no-op,
  // and onto the sRGB canvas an encoded value adds far too much (see DIRECT_GAIN).
}`;

/**
 * Sunbeams through the canopy: one instanced open cone per shaft, every one tilted along the
 * world's sun direction so they all fall in parallel, drawn additively with no depth write so
 * they cross trees and each other without cutting either. The only motion is dust drifting down
 * the beam on `SharedUniforms.time`, which the low tier compiles out and reduced motion freezes.
 */
export class LightShafts implements WorldObject {
  readonly id = 'light-shafts';

  private mesh?: InstancedMesh;
  private gain?: { value: number };

  constructor(private readonly options: LightShaftOptions) {}

  init(ctx: WorldContext): void {
    const { shafts, shared } = this.options;
    const detail = ctx.quality.shaderDetail;
    this.gain = { value: gainFor(ctx) };

    const geometry = new CylinderGeometry(TOP_TAPER, 1, 1, SEGMENTS[detail], 1, true);
    const material = new ShaderMaterial({
      name: 'light-shafts',
      defines: { SHAFT_NOISE: detail },
      uniforms: {
        time: shared.time,
        colour: { value: new Color(this.options.colour) },
        intensity: { value: this.options.intensity },
        gain: this.gain,
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    });

    const mesh = new InstancedMesh(geometry, material, shafts.length);
    mesh.name = this.id;
    const sun = shared.sunDirection.value;
    const tilt = new Quaternion().setFromUnitVectors(UP, sun.clone().normalize());
    const matrix = new Matrix4();
    const centre = new Vector3();
    const scale = new Vector3();
    shafts.forEach((shaft, i) => {
      // The axis crosses y = 0 at (x, z); the foot is further back along the sun, underground.
      centre
        .set(shaft.x, 0, shaft.z)
        .addScaledVector(sun, shaft.height / 2 - FOOT_DEPTH / Math.max(sun.y, 0.05));
      scale.set(shaft.radius, shaft.height, shaft.radius);
      mesh.setMatrixAt(i, matrix.compose(centre, tilt, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(_dt: number, ctx: WorldContext): void {
    // The dust drifts in the shader on the shared clock. The tier can change under a running
    // world, and with it whether the beam is added before or after the sRGB encoding.
    const gain = gainFor(ctx);
    const uniform = this.gain;
    if (uniform && uniform.value !== gain) {
      uniform.value = gain;
    }
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
    this.gain = undefined;
  }
}

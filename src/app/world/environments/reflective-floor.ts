import { AdditiveBlending, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { WorldContext, WorldObject } from '@engine/world-object';

export interface ReflectiveFloorOptions {
  readonly size: number;
  /** 0 no reflection … 1 mirror; blended by fresnel. */
  readonly strength: number;
  /** Blur of the reflection, 0 sharp … 1 very soft. */
  readonly roughness: number;
}

/**
 * Just above the floor, so the depth test keeps it in front of the floor it lies on, and still
 * inside the "on the floor" allowance the showroom's spec gives (y ≤ 0.02).
 */
const FLOOR_Y = 0.002;
/** The reflection renders at this fraction of the drawing buffer: it is blurred anyway. */
const RESOLUTION = 0.5;
/** Blur radius in reflection texels at roughness 1; a rough floor smears more up the screen. */
const BLUR_TEXELS = 22;
/** How far from the walls the reflection fades out, in metres. */
const EDGE_FADE = 1.6;

const VERTEX_SHADER = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vUv = textureMatrix * vec4(position, 1.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

/**
 * Three's reflector shader extended the way a polished floor needs it: seven taps on a golden-angle
 * spiral, stretched up the screen as a rough surface stretches a reflection, a Schlick fresnel so
 * the floor mirrors at grazing angles and barely at the visitor's feet, and a fade before the
 * walls, where the half-resolution image and the skirting would disagree. It is drawn additively
 * over the floor's own shading: the reflection is the floor's specular part.
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform float strength;
uniform float roughness;
uniform float halfSize;
uniform vec2 texel;
varying vec4 vUv;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec2 uv = vUv.xy / vUv.w;
  vec2 spread = texel * (0.5 + roughness * ${BLUR_TEXELS.toFixed(1)}) * vec2(1.0, 2.2);
  vec3 sum = texture2D(tDiffuse, uv).rgb * 1.5;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 2.39996 + 0.4;
    float r = sqrt((float(i) + 0.5) / 6.0);
    sum += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r * spread).rgb;
  }
  vec3 reflection = sum / 7.5;

  vec3 toEye = normalize(cameraPosition - vWorld);
  float facing = 1.0 - clamp(toEye.y, 0.0, 1.0);
  float facing2 = facing * facing;
  float fresnel = 0.04 + 0.96 * facing2 * facing2 * facing;
  float edge = halfSize - max(abs(vWorld.x), abs(vWorld.z));
  float amount = strength * fresnel * smoothstep(0.0, ${EDGE_FADE.toFixed(2)}, edge);

  gl_FragColor = vec4(reflection * color * amount, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A planar reflection lying on the floor, on the strongest tier only; adds nothing below it. */
export class ReflectiveFloor implements WorldObject {
  readonly id = 'reflective-floor';

  private reflector: Reflector | null = null;

  constructor(private readonly options: ReflectiveFloorOptions) {}

  init(ctx: WorldContext): void {
    // The reflection re-renders the whole scene; only the tier that can afford the post stack
    // can afford that too.
    if (!ctx.quality.postProcessing) {
      return;
    }

    const { size, strength, roughness } = this.options;
    const texel = new Vector2(1, 1);
    const reflector = new Reflector(new PlaneGeometry(size, size), {
      color: 0xffffff,
      // Sized to the screen before the first reflection renders; see below.
      textureWidth: 1,
      textureHeight: 1,
      // The blur hides any aliasing, so multisampling would buy nothing for its memory.
      multisample: 0,
      shader: {
        name: 'ReflectiveFloorShader',
        uniforms: {
          color: { value: null },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          strength: { value: Math.min(Math.max(strength, 0), 1) },
          roughness: { value: Math.min(Math.max(roughness, 0), 1) },
          halfSize: { value: size / 2 },
          texel: { value: texel },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
      },
    });
    reflector.name = 'reflective-floor';
    reflector.rotateX(-Math.PI / 2);
    reflector.position.y = FLOOR_Y;

    const material = reflector.material as ShaderMaterial;
    material.uniforms['texel'].value = texel;
    material.transparent = true;
    material.blending = AdditiveBlending;
    // Never an occluder: the ambient-occlusion pass skips what does not write depth, which also
    // keeps its normal re-render from rendering the reflection a second time.
    material.depthWrite = false;

    // Follow the drawing buffer at half its size, so the reflection stays as sharp as the screen
    // allows whatever the window does, without a renderer reference at init.
    const target = reflector.getRenderTarget();
    const drawing = new Vector2();
    const render = reflector.onBeforeRender;
    reflector.onBeforeRender = (renderer, scene, camera, geometry, surface, group) => {
      renderer.getDrawingBufferSize(drawing);
      const width = Math.max(1, Math.round(drawing.x * RESOLUTION));
      const height = Math.max(1, Math.round(drawing.y * RESOLUTION));
      if (target.width !== width || target.height !== height) {
        target.setSize(width, height);
        texel.set(1 / width, 1 / height);
      }
      render.call(reflector, renderer, scene, camera, geometry, surface, group);
    };

    this.reflector = reflector;
    ctx.scene.add(reflector);
  }

  update(): void {
    // The reflector renders itself from `onBeforeRender`.
  }

  dispose(): void {
    if (!this.reflector) {
      return;
    }
    this.reflector.removeFromParent();
    this.reflector.geometry.dispose();
    // Frees the render target, which lives only in a uniform where `disposeObject3D` cannot see
    // it, and the material.
    this.reflector.dispose();
    this.reflector = null;
  }
}

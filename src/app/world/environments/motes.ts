import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { QualitySettings } from '@engine/capability.service';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { between, seededRandom } from './random';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SharedUniforms } from './shaders/shared-uniforms';

/** What a cloud of glowing specks needs to know: pollen in a sunbeam or fireflies in a hollow. */
export interface MotesOptions {
  readonly shared: SharedUniforms;
  readonly seed: number;
  /** Points on the high tier; scaled by `propDensity`, and halved again on the low tier. */
  readonly count: number;
  /**
   * Where the motes live. With `followCamera` off, a cylinder of `radius` around `(x, z)` between
   * the absolute heights `minY` and `maxY`. With it on, `x` and `z` are ignored: the motes fill a
   * box of `± radius` around the camera and a height band from `minY` to `maxY` *relative to the
   * camera's height*, so a visitor climbing a hill keeps their pollen with them.
   */
  readonly area: {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
    readonly minY: number;
    readonly maxY: number;
  };
  /** True for a cloud of pollen around the player; false for a fixed swarm. */
  readonly followCamera: boolean;
  /**
   * For a fixed swarm only: the terrain under it. Given, `minY` and `maxY` are heights above the
   * ground at each mote's own spot, so fireflies over uneven ground neither sink into a rise nor
   * float high over a hollow.
   */
  readonly heightAt?: (x: number, z: number) => number;
  readonly colour: number;
  /** Diameter in metres. */
  readonly size: number;
  /** HDR multiplier; > 1 blooms on the high tier. */
  readonly glow: number;
  /**
   * The multiplier used instead of `glow` where the motes draw straight onto the canvas (every
   * tier without the post stack). There each point is tone-mapped and sRGB-encoded before it adds,
   * and an encoded speck adds roughly twice what the same light adds to the HDR buffer, so a cloud
   * tuned to bloom on the high tier glares elsewhere. Omitted, it is `glow`.
   */
  readonly directGlow?: number;
  /** Metres of wander around the base position. */
  readonly drift: number;
  /** 0 steady … 1 firefly. */
  readonly flicker: number;
}

/** The largest a mote may grow on screen, in device pixels: near ones fade out before this bites. */
const MAX_POINT_PIXELS = 48;

const VERTEX_SHADER = /* glsl */ `
${NOISE_GLSL}
uniform float time;
uniform float follow;
uniform float areaRadius;
uniform vec2 heightBand;
uniform float drift;
uniform float flicker;
uniform float size;
uniform float pointScale;
uniform float fadeDistance;
attribute vec2 seed;
varying float vBrightness;

const float TAU = 6.28318530718;

void main() {
  float phase = seed.x;

  // Three independent noise tracks per point, each unpacked around zero, so a mote wanders
  // rather than oscillates; the slow bob keeps it moving even where the noise happens to be flat.
  vec2 track = vec2(phase * 97.0, time * 0.12);
  vec3 wander = vec3(noise2(track), noise2(track + vec2(31.7, 0.0)), noise2(track + vec2(63.1, 0.0)));
  vec3 p = position + (wander * 2.0 - 1.0) * drift;
  p.y += sin(time * 0.6 + phase * TAU) * drift * 0.25;

  if (follow > 0.5) {
    // Wrap into the box around the camera. GLSL mod() is never negative for a positive divisor.
    vec2 half2 = vec2(areaRadius);
    p.xz = cameraPosition.xz + mod(p.xz + half2, 2.0 * half2) - half2;
    float span = max(heightBand.y - heightBand.x, 0.01);
    p.y = cameraPosition.y + heightBand.x + mod(p.y - heightBand.x, span);
  }

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-mvPosition.z, 0.05);
  gl_Position = projectionMatrix * mvPosition;

  // Perspective size like PointsMaterial, but honouring the field of view too.
  float pixels = size * seed.y * pointScale * projectionMatrix[1][1] / depth;
  gl_PointSize = clamp(pixels, 1.0, ${MAX_POINT_PIXELS.toFixed(1)});

  // Fade out right in front of the lens and again where the cloud ends, so no mote turns into a
  // blob or pops when it wraps to the far side of the box.
  float nearFade = smoothstep(0.35, 1.5, depth);
  float farFade = 1.0 - smoothstep(fadeDistance * 0.6, fadeDistance, length(p - cameraPosition));
  float pulse = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(time * (1.5 + 2.5 * fract(phase * 3.7)) + phase * TAU));
  vBrightness = mix(1.0, pulse, flicker) * nearFade * farFade * min(pixels, 1.0);
}`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 colour;
uniform float glow;
varying float vBrightness;

void main() {
  // A soft disc with a hotter core, drawn from the point coordinate: no texture to load or dispose.
  vec2 c = gl_PointCoord - 0.5;
  float disc = max(1.0 - dot(c, c) * 4.0, 0.0);
  float soft = disc * disc;
  float core = soft * soft;
  gl_FragColor = vec4(colour * glow * vBrightness * (soft + core * 0.5), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * A single `Points` object of glowing specks that drift on smooth noise. Everything animated
 * happens in the vertex shader off `SharedUniforms.time`, so the CPU does nothing per frame and
 * reduced motion freezes the cloud with everything else.
 */
export class Motes implements WorldObject {
  readonly id = 'motes';

  private points?: Points;
  private readonly viewport = new Vector2();

  constructor(private readonly options: MotesOptions) {}

  init(ctx: WorldContext): void {
    const { area, followCamera, shared } = this.options;
    const count = pointCount(this.options.count, ctx.quality);
    const geometry = new BufferGeometry();
    const { positions, seeds } = layout(this.options, count);
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 2));

    const uniforms = {
      time: shared.time,
      follow: { value: followCamera ? 1 : 0 },
      areaRadius: { value: area.radius },
      heightBand: { value: new Vector2(area.minY, area.maxY) },
      drift: { value: this.options.drift },
      flicker: { value: this.options.flicker },
      size: { value: this.options.size },
      pointScale: { value: 1 },
      // A fixed swarm is seen from wherever the visitor stands, so it may only fade with the fog.
      fadeDistance: { value: Math.max(followCamera ? area.radius : ctx.quality.fogFar, 1) },
      colour: { value: new Color(this.options.colour) },
      glow: { value: this.options.glow },
    };
    const hdrGlow = this.options.glow;
    const directGlow = this.options.directGlow ?? hdrGlow;
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const points = new Points(geometry, material);
    points.name = 'motes';
    if (followCamera) {
      // The shader keeps the cloud around the camera, so it is never out of view.
      points.frustumCulled = false;
    } else {
      if (this.options.heightAt) {
        geometry.computeBoundingSphere();
        const sphere = geometry.boundingSphere as Sphere | null;
        if (sphere) {
          sphere.radius += this.options.drift * 1.25;
        }
      } else {
        const halfSpan = (area.maxY - area.minY) / 2;
        geometry.boundingSphere = new Sphere(
          new Vector3(area.x, area.minY + halfSpan, area.z),
          Math.hypot(area.radius, halfSpan) + this.options.drift * 1.25,
        );
      }
    }
    // The context carries no renderer, and the size a mote should have on screen depends on the
    // drawing buffer's height. Three hands the renderer over right before each draw, so read it
    // there and touch the uniform only when the canvas has actually changed. The same moment
    // tells which path the frame takes: the post stack draws the scene into a render target, a
    // tier without it straight onto the canvas.
    points.onBeforeRender = (renderer: WebGLRenderer) => {
      renderer.getSize(this.viewport);
      const scale = this.viewport.y * renderer.getPixelRatio() * 0.5;
      if (scale !== uniforms.pointScale.value) {
        uniforms.pointScale.value = scale;
      }
      uniforms.glow.value = renderer.getRenderTarget() ? hdrGlow : directGlow;
    };

    this.points = points;
    ctx.scene.add(points);
  }

  update(): void {
    // Everything moves in the shader on the shared clock.
  }

  dispose(): void {
    if (this.points) {
      disposeObject3D(this.points);
      this.points = undefined;
    }
  }
}

/** The low tier draws half as many: additive overdraw is what SwiftShader feels most. */
function pointCount(count: number, quality: QualitySettings): number {
  const lowTier = quality.shaderDetail === 0;
  return Math.max(0, Math.round(count * quality.propDensity * (lowTier ? 0.5 : 1)));
}

function layout(
  options: MotesOptions,
  count: number,
): { positions: Float32Array; seeds: Float32Array } {
  const { area, followCamera, seed } = options;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    if (followCamera) {
      // Relative to the camera: a box in x/z, the height band as given.
      positions[i * 3] = between(random, -area.radius, area.radius);
      positions[i * 3 + 2] = between(random, -area.radius, area.radius);
    } else {
      // Uniform over the disc: the square root keeps the centre from crowding.
      const r = Math.sqrt(random()) * area.radius;
      const angle = between(random, 0, Math.PI * 2);
      positions[i * 3] = area.x + Math.cos(angle) * r;
      positions[i * 3 + 2] = area.z + Math.sin(angle) * r;
    }
    const ground =
      !followCamera && options.heightAt
        ? options.heightAt(positions[i * 3], positions[i * 3 + 2])
        : 0;
    positions[i * 3 + 1] = ground + between(random, area.minY, area.maxY);
    seeds[i * 2] = random();
    seeds[i * 2 + 1] = between(random, 0.6, 1.4);
  }

  return { positions, seeds };
}

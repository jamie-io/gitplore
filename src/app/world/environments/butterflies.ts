import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { between, seededRandom } from './random';
import { SharedUniforms } from './shaders/shared-uniforms';

/** Where a flock of butterflies flutters and what it looks like. */
export interface ButterfliesOptions {
  readonly shared: SharedUniforms;
  readonly seed: number;
  /** Butterflies on the high tier; scaled by `propDensity`. */
  readonly count: number;
  /** A disc of `radius` around `(x, z)`; each loop hovers `height` metres above the ground. */
  readonly area: {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
    readonly height: number;
  };
  /** sRGB hex colours; each butterfly picks one. */
  readonly colours: readonly number[];
  /** Sampled once per butterfly, so no loop dips into a rise of the terrain. */
  readonly ground: HeightField;
}

/** Each wing, in metres: the pair spans about the width of a real meadow brown. */
const WING_SPAN = 0.045;
const WING_LENGTH = 0.055;

/** Loop half-widths in metres. The smallest loop still reads as flight, not hovering. */
const LOOP_MIN = 1.4;
const LOOP_MAX = 4.5;
/** Angular speed of the slower axis, radians per second: about walking pace along the loop. */
const RATE_MIN = 0.16;
const RATE_MAX = 0.3;
/** Frequency ratios between the two axes, so the loops are figures rather than ellipses. */
const RATIOS = [0.5, 2 / 3, 0.75, 1.5, 4 / 3];
/** Metres of vertical bob on top of the hover height. */
const BOB = 0.18;

const VERTEX_SHADER = /* glsl */ `
uniform float time;
uniform vec3 sunDirection;
attribute vec3 iCentre;
attribute vec4 iLoop;
attribute vec4 iPhase;
attribute vec3 iColour;
varying vec3 vColour;
varying vec2 vUv;
varying float vLight;
#include <fog_pars_vertex>

void main() {
  // Lissajous loop: iLoop = (half-width x, half-width z, rate x, rate z), iPhase.xy the offsets.
  vec2 arg = iLoop.zw * time + iPhase.xy;
  vec2 s = sin(arg);
  vec2 c = cos(arg);
  vec3 centre = iCentre + vec3(iLoop.x * s.x, ${BOB.toFixed(2)} * sin(time * 1.3 + iPhase.z), iLoop.y * s.y);

  // The heading follows the loop's tangent; at a standstill (never on a live loop) face +Z.
  vec2 tangent = iLoop.xy * iLoop.zw * c;
  float speed = length(tangent);
  vec2 forward2 = speed > 1e-4 ? tangent / speed : vec2(0.0, 1.0);
  vec3 f = vec3(forward2.x, 0.0, forward2.y);
  vec3 r = vec3(f.z, 0.0, -f.x);
  mat3 heading = mat3(r, vec3(0.0, 1.0, 0.0), f);

  // Both wings rise together about the body axis (local z); the flap never quite closes.
  float flap = mix(-0.35, 1.25, 0.5 + 0.5 * sin(time * iPhase.w + iPhase.z));
  vec3 local = vec3(position.x * cos(flap), abs(position.x) * sin(flap), position.z);
  vec3 localNormal = vec3(-sign(position.x) * sin(flap), cos(flap), 0.0);

  vec3 world = centre + heading * local;
  vec3 normal = heading * localNormal;
  // Both faces catch the sun: the wing is paper, lit from either side.
  vLight = 0.55 + 0.45 * abs(dot(normal, sunDirection));
  vColour = iColour;
  vUv = uv;

  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColour;
varying vec2 vUv;
varying float vLight;
#include <fog_pars_fragment>

void main() {
  // Cut a rounded wing out of the quad: an ellipse that narrows towards the body at uv.x = 0.
  vec2 q = vec2((vUv.x - 0.45) / 0.55, (vUv.y - 0.5) / 0.5);
  float e = dot(q, q);
  if (e > 1.0) discard;

  // Dark rim, dark body root and one eyespot: enough pattern to read as a butterfly up close.
  float rim = mix(1.0, 0.35, smoothstep(0.72, 1.0, e));
  float root = mix(0.25, 1.0, smoothstep(0.0, 0.14, vUv.x));
  float spot = mix(0.4, 1.0, smoothstep(0.09, 0.15, distance(vUv, vec2(0.62, 0.55))));
  gl_FragColor = vec4(vColour * vLight * rim * root * spot, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * A flock drawn as one instanced mesh of two wing quads. Each butterfly flies its own Lissajous
 * loop and flaps in the vertex shader, both off `SharedUniforms.time`, so the CPU does nothing per
 * frame and reduced motion holds every wing still.
 */
export class Butterflies implements WorldObject {
  readonly id = 'butterflies';

  private mesh?: Mesh;

  constructor(private readonly options: ButterfliesOptions) {}

  init(ctx: WorldContext): void {
    const { area, shared } = this.options;
    const count = Math.max(0, Math.round(this.options.count * ctx.quality.propDensity));
    const geometry = wingGeometry();
    const flock = layout(this.options, count);
    geometry.instanceCount = count;
    geometry.setAttribute('iCentre', new InstancedBufferAttribute(flock.centres, 3));
    geometry.setAttribute('iLoop', new InstancedBufferAttribute(flock.loops, 4));
    geometry.setAttribute('iPhase', new InstancedBufferAttribute(flock.phases, 4));
    geometry.setAttribute('iColour', new InstancedBufferAttribute(flock.colours, 3));
    // Three would size the sphere from the wing quad alone; the flock spans the whole area.
    geometry.boundingSphere = new Sphere(
      new Vector3(area.x, flock.meanHeight, area.z),
      area.radius + area.height + LOOP_MAX,
    );

    // Merging clones the fog uniforms; the shared ones are assigned afterwards by identity.
    const uniforms = UniformsUtils.merge([UniformsLib['fog']]);
    uniforms['time'] = shared.time;
    uniforms['sunDirection'] = shared.sunDirection;
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: DoubleSide,
      fog: true,
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = 'butterflies';
    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(): void {
    // Flight and flapping live in the shader on the shared clock.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}

/** Two quads meeting at the body: local +X is the right wing, +Z forward, wings flat at y = 0. */
function wingGeometry(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const side of [-1, 1]) {
    const base = positions.length / 3;
    for (const [tip, along] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      positions.push(side * tip * WING_SPAN, 0, (along - 0.5) * WING_LENGTH);
      // uv.x runs from the body to the tip on both wings, so one pattern serves both.
      uvs.push(tip, along);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

interface Flock {
  readonly centres: Float32Array;
  readonly loops: Float32Array;
  readonly phases: Float32Array;
  readonly colours: Float32Array;
  readonly meanHeight: number;
}

function layout(options: ButterfliesOptions, count: number): Flock {
  const { area, ground, seed } = options;
  const random = seededRandom(seed);
  const palette = options.colours.map((hex) => new Color(hex));
  const centres = new Float32Array(count * 3);
  const loops = new Float32Array(count * 4);
  const phases = new Float32Array(count * 4);
  const colours = new Float32Array(count * 3);
  let heightSum = 0;

  for (let i = 0; i < count; i++) {
    // Place the loop's centre so that the whole loop stays inside the area.
    const halfX = between(random, LOOP_MIN, LOOP_MAX);
    const halfZ = between(random, LOOP_MIN, LOOP_MAX);
    const reach = Math.max(area.radius - Math.max(halfX, halfZ), 0);
    const r = Math.sqrt(random()) * reach;
    const angle = between(random, 0, Math.PI * 2);
    const x = area.x + Math.cos(angle) * r;
    const z = area.z + Math.sin(angle) * r;
    const y = hoverHeight(ground, x, z, halfX, halfZ) + area.height;
    heightSum += y;
    centres.set([x, y, z], i * 3);

    const rate = between(random, RATE_MIN, RATE_MAX);
    const ratio = RATIOS[Math.floor(random() * RATIOS.length)] ?? 1;
    loops.set([halfX, halfZ, rate, rate * ratio], i * 4);
    phases.set(
      [
        between(random, 0, Math.PI * 2),
        between(random, 0, Math.PI * 2),
        between(random, 0, Math.PI * 2),
        between(random, 9, 15),
      ],
      i * 4,
    );

    const colour = palette[Math.floor(random() * palette.length)] ?? new Color(0xffffff);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }

  return { centres, loops, phases, colours, meanHeight: count ? heightSum / count : area.height };
}

/**
 * The ground under a loop, taken as the highest of nine samples over its bounding box (a
 * Lissajous figure reaches the corners): a loop that hovered off its centre alone would clip a
 * rise on its far side.
 */
function hoverHeight(
  ground: HeightField,
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
): number {
  let highest = -Infinity;
  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      highest = Math.max(highest, ground.heightAt(x + dx * halfX, z + dz * halfZ));
    }
  }
  return highest;
}

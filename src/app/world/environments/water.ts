import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Mood } from './mood';
import { ATMOSPHERE_FOG_GLSL } from './shaders/atmosphere';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface WaterOptions {
  readonly shared: SharedUniforms;
  readonly mood: Mood;
  /** World x, z of the disc's centre. */
  readonly centre: readonly [number, number];
  readonly radius: number;
  /** World y of the surface. */
  readonly level: number;
  /** Bed height, sampled per vertex for depth and foam. */
  readonly ground: HeightField;
  /** sRGB hex: the body colour over a shallow bed, over a deep one, and the shore foam. */
  readonly colours: { readonly shallow: number; readonly deep: number; readonly foam: number };
}

/** Metres of depth over which the body colour goes from `shallow` to `deep`. */
const DEPTH_TINT_METRES = 1.4;
/** Foam reaches this far out from the shore, in metres of depth. */
const FOAM_DEPTH = 0.25;
/** The surface fades in over this much depth, so it never fights the bed at the shoreline. */
const EDGE_FADE_DEPTH = 0.15;

/** Segments around the disc and rings across it, per `shaderDetail` tier. */
const SEGMENTS: readonly [number, number, number] = [48, 96, 160];
const RINGS: readonly [number, number, number] = [4, 8, 12];

/**
 * A pond surface: a disc at the water line whose colour deepens with the bed below it, reflects
 * an analytic sky through a Fresnel term, glints towards the sun in HDR, and foams where the bed
 * comes up to meet it. Everything that moves reads `shared.time`, so reduced motion holds it
 * still along with the rest of the world.
 */
export class Water implements WorldObject {
  readonly id = 'water';

  private mesh?: Mesh;

  constructor(private readonly options: WaterOptions) {}

  init(ctx: WorldContext): void {
    const detail = ctx.quality.shaderDetail;
    const geometry = discGeometry(this.options.radius, SEGMENTS[detail], RINGS[detail]);
    this.bakeDepth(geometry);

    this.mesh = new Mesh(geometry, waterMaterial(this.options, detail));
    this.mesh.name = this.id;
    this.mesh.position.set(this.options.centre[0], this.options.level, this.options.centre[1]);
    ctx.scene.add(this.mesh);
  }

  update(): void {
    // The ripples, glints and foam all move on `shared.time`; nothing here changes per frame.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }

  /**
   * `aDepth` is how much water stands over the bed at each vertex: positive inside the pond, zero
   * at the water line, negative where the bank is above the surface and the terrain hides the disc
   * anyway. The fragment shader tints, foams and fades on it.
   */
  private bakeDepth(geometry: BufferGeometry): void {
    const { centre, level, ground } = this.options;
    const position = geometry.getAttribute('position');
    const depth = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      depth[i] =
        level - ground.heightAt(centre[0] + position.getX(i), centre[1] + position.getZ(i));
    }
    geometry.setAttribute('aDepth', new Float32BufferAttribute(depth, 1));
  }
}

/**
 * A flat disc in the XZ plane facing +Y, with `rings` concentric rows of vertices instead of
 * `CircleGeometry`'s single fan, so the per-vertex depth can follow the bed's bowl instead of
 * interpolating straight from the rim to the centre.
 */
function discGeometry(radius: number, segments: number, rings: number): BufferGeometry {
  const positions: number[] = [0, 0, 0];
  for (let ring = 1; ring <= rings; ring++) {
    const r = (radius * ring) / rings;
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    }
  }

  const index: number[] = [];
  for (let s = 0; s < segments; s++) {
    index.push(0, 1 + ((s + 1) % segments), 1 + s);
  }
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = inner + segments;
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      index.push(inner + s, outer + next, outer + s, inner + s, inner + next, outer + next);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vWorld;

void main() {
  vDepth = aDepth;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// A ShaderMaterial has no fog chunk for `withAtmosphere` to patch, so the water declares Three's
// fog uniforms itself and calls the atmosphere's own fog function: it must fog exactly like the
// bank beside it or the pond reads as a hole in the haze.
const FRAGMENT_SHADER = /* glsl */ `
${NOISE_GLSL}

uniform float time;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 heightFog;
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skyGlow;
uniform vec3 skyBelow;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 foamColor;

#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif

varying float vDepth;
varying vec3 vWorld;

${ATMOSPHERE_FOG_GLSL}

// Scrolling value noise summed into a height field: a broad swell alone on the low tier, with
// two finer, faster layers crossing it on the others.
float ripple(vec2 p) {
  float h = noise2(p * 0.9 + vec2(time * 0.06, time * 0.04));
  #if WATER_LAYERS > 1
    h += 0.5 * noise2(p * 2.3 + vec2(-time * 0.11, time * 0.07));
  #endif
  #if WATER_LAYERS > 2
    h += 0.25 * noise2(p * 5.1 + vec2(time * 0.17, -time * 0.13));
  #endif
  return h;
}

// Finite differences of the height field: three noise sums per layer, no derivative maths.
vec3 rippleNormal(vec2 p) {
  const float e = 0.08;
  const float amplitude = 0.035;
  float h = ripple(p);
  float hx = ripple(p + vec2(e, 0.0));
  float hz = ripple(p + vec2(0.0, e));
  return normalize(vec3((h - hx) * amplitude / e, 1.0, (h - hz) * amplitude / e));
}

// The sky the water mirrors: the mood's gradient with a warm band low on the sun's side, written
// from the same fields the dome reads, so the reflection and the sky above it agree.
vec3 skyTowards(vec3 dir) {
  float up = dir.y;
  vec3 above = mix(skyHorizon, skyZenith, smoothstep(0.02, 0.55, up));
  vec3 sky = mix(skyBelow, above, smoothstep(-0.08, 0.02, up));
  vec2 flatDir = dir.xz;
  vec2 flatSun = sunDirection.xz;
  float lengths = length(flatDir) * length(flatSun);
  float toward = lengths > 1e-4 ? max(dot(flatDir, flatSun) / lengths, 0.0) : 0.0;
  float band = pow(toward, 6.0) * (1.0 - smoothstep(0.0, 0.35, abs(up)));
  return mix(sky, skyGlow, band * 0.8);
}

void main() {
  vec2 p = vWorld.xz;
  vec3 normal = rippleNormal(p);

  vec3 toCamera = cameraPosition - vWorld;
  float camDist = length(toCamera);
  vec3 viewDir = toCamera / max(camDist, 1e-4);
  float cosTheta = max(dot(viewDir, normal), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - cosTheta, 5.0);

  float depth = max(vDepth, 0.0);
  float depthMix = 1.0 - exp(-depth / ${DEPTH_TINT_METRES.toFixed(2)});
  vec3 body = mix(shallowColor, deepColor, depthMix);
  // A little relief on the ripples: the faces turned to the sun pick up its colour.
  body *= 0.82 + 0.18 * max(dot(normal, sunDirection), 0.0) * sunColor;

  vec3 reflected = reflect(-viewDir, normal);
  vec3 reflection = skyTowards(reflected);
  vec3 colour = mix(body, reflection, fresnel);

  // The glint stays well above 1 so the high tier's bloom catches it; elsewhere the tone curve
  // at the end folds it back into range.
  float glint = pow(max(dot(reflected, sunDirection), 0.0), 320.0);
  colour += sunColor * glint * 4.0;

  // Foam: solid at the water line, breaking up into lace as the bed drops away.
  float shore = 1.0 - smoothstep(0.0, ${FOAM_DEPTH.toFixed(2)}, vDepth);
  float lace = noise2(p * 3.5 + vec2(time * 0.2, -time * 0.15));
  #if WATER_LAYERS > 1
    lace = 0.6 * lace + 0.4 * noise2(p * 9.0 - vec2(time * 0.35, time * 0.25));
  #endif
  float foam = smoothstep(0.75, 0.9, lace + 0.5 * shore) * smoothstep(0.0, 0.3, shore);
  colour = mix(colour, foamColor, foam);

  float alpha = max(mix(0.6, 0.94, depthMix), fresnel);
  alpha = mix(alpha, 1.0, foam);
  alpha *= smoothstep(0.0, ${EDGE_FADE_DEPTH.toFixed(2)}, vDepth);

  colour = atmosphereFog(colour, vWorld, sunDirection, sunColor, heightFog);

  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function waterMaterial(options: WaterOptions, detail: 0 | 1 | 2): ShaderMaterial {
  const { shared, mood, colours } = options;
  // Three refreshes `fogColor`, `fogNear` and `fogFar` from `scene.fog` on any material with
  // `fog: true` that declares them, so the water follows the same fog the terrain does.
  return new ShaderMaterial({
    name: 'water',
    defines: { WATER_LAYERS: detail + 1 },
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      time: shared.time,
      sunDirection: shared.sunDirection,
      sunColor: shared.sunColor,
      heightFog: shared.heightFog,
      skyZenith: { value: new Color(mood.sky.zenith) },
      skyHorizon: { value: new Color(mood.sky.horizon) },
      skyGlow: { value: new Color(mood.sky.sunGlow) },
      skyBelow: { value: new Color(mood.sky.below) },
      shallowColor: { value: new Color(colours.shallow) },
      deepColor: { value: new Color(colours.deep) },
      foamColor: { value: new Color(colours.foam) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

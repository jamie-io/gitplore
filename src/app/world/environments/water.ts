import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IUniform,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Mood } from './mood';
import { ATMOSPHERE_FOG_GLSL } from './shaders/atmosphere';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { groundHazeProgram } from './shaders/ground-haze';
import { SharedUniforms } from './shaders/shared-uniforms';

interface WaterBase {
  readonly shared: SharedUniforms;
  readonly mood: Mood;
  /** World y of the surface. */
  readonly level: number;
  /** Bed height, sampled per vertex for depth and foam. */
  readonly ground: HeightField;
  /** sRGB hex: the body colour over a shallow bed, over a deep one, and the shore foam. */
  readonly colours: { readonly shallow: number; readonly deep: number; readonly foam: number };
  /**
   * Metres per second the ripples and the foam drift, as world x, z: a stream's current. Left
   * out, the water stands still and compiles exactly the shader a pond always has.
   */
  readonly flow?: readonly [number, number];
  /**
   * 0 … 1: how much of the sky the surface mirrors. A stream under a canopy sees leaves more than
   * sky, and at a walker's grazing angle a full mirror turns it into a pale band. Left out, the
   * surface mirrors the sky fully and compiles exactly the shader a pond always has.
   */
  readonly reflection?: number;
  /**
   * Fogs after the tone curve and the colour space, where Three's fog chunk sits in every standard
   * material: Three uploads `fogColor` in the output colour space, so fogging before the conversion
   * paints the haze on the water paler than on the bank beside it. Left out, the fog keeps the
   * order the other worlds' ponds were tuned with, and their shader stays exactly as it was.
   */
  readonly bankFog?: boolean;
}

/** A round pond. */
export interface PondShape {
  /** World x, z of the disc's centre. */
  readonly centre: readonly [number, number];
  readonly radius: number;
}

/** A watercourse: a band `halfWidth` either side of the line through `path`'s world x, z points. */
export interface StreamShape {
  readonly path: readonly (readonly [number, number])[];
  readonly halfWidth: number;
}

export type WaterOptions = WaterBase & (PondShape | StreamShape);

/** Metres of depth over which the body colour goes from `shallow` to `deep`. */
const DEPTH_TINT_METRES = 1.4;
/** Foam reaches this far out from the shore, in metres of depth. */
const FOAM_DEPTH = 0.25;
/** The surface fades in over this much depth, so it never fights the bed at the shoreline. */
const EDGE_FADE_DEPTH = 0.15;

/** Segments around the disc and rings across it, per `shaderDetail` tier. */
const SEGMENTS: readonly [number, number, number] = [48, 96, 160];
const RINGS: readonly [number, number, number] = [4, 8, 12];
/** A stream's rows: metres between two along its line, and vertices across it, per tier. */
const ROW_SPACING: readonly [number, number, number] = [2, 1.2, 0.8];
const ACROSS: readonly [number, number, number] = [5, 7, 9];

/**
 * A pond surface: a disc at the water line whose colour deepens with the bed below it, reflects
 * an analytic sky through a Fresnel term, glints towards the sun in HDR, and foams where the bed
 * comes up to meet it. Everything that moves reads `shared.time`, so reduced motion holds it
 * still along with the rest of the world.
 *
 * Given a `path` instead of a centre it lays the same surface as a ribbon along a watercourse,
 * wide enough to reach under the banks: the depth fade hides whatever lies above the water line.
 */
export class Water implements WorldObject {
  readonly id = 'water';

  private mesh?: Mesh;

  constructor(private readonly options: WaterOptions) {}

  init(ctx: WorldContext): void {
    const detail = ctx.quality.shaderDetail;
    const { options } = this;
    const geometry =
      'path' in options
        ? ribbonGeometry(options.path, options.halfWidth, ROW_SPACING[detail], ACROSS[detail])
        : discGeometry(options.radius, SEGMENTS[detail], RINGS[detail]);
    const [x, z] = this.origin();
    this.bakeDepth(geometry, x, z);

    this.mesh = new Mesh(geometry, waterMaterial(options, detail));
    this.mesh.name = this.id;
    this.mesh.position.set(x, options.level, z);
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
  private bakeDepth(geometry: BufferGeometry, x: number, z: number): void {
    const { level, ground } = this.options;
    const position = geometry.getAttribute('position');
    const depth = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      depth[i] = level - ground.heightAt(x + position.getX(i), z + position.getZ(i));
    }
    geometry.setAttribute('aDepth', new Float32BufferAttribute(depth, 1));
  }

  /** World x, z the mesh stands on: a pond's centre, or the origin for a stream laid in world space. */
  private origin(): readonly [number, number] {
    return 'path' in this.options ? [0, 0] : this.options.centre;
  }
}

/**
 * A flat band in the XZ plane facing +Y: rows of `across` vertices square to the line through
 * `path`, one every `spacing` metres or less, so the per-vertex depth follows the channel's
 * profile. Every vertex lies within `halfWidth` of the line, and the middle one of each row on it.
 */
function ribbonGeometry(
  path: readonly (readonly [number, number])[],
  halfWidth: number,
  spacing: number,
  across: number,
): BufferGeometry {
  const rows: [number, number][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / spacing));
    for (let step = 0; step < steps; step++) {
      rows.push([ax + ((bx - ax) * step) / steps, az + ((bz - az) * step) / steps]);
    }
  }
  rows.push([path[path.length - 1][0], path[path.length - 1][1]]);

  const positions: number[] = [];
  rows.forEach(([x, z], row) => {
    // The line's direction here, averaged over the rows either side, so a bend fans out.
    const [px, pz] = rows[Math.max(row - 1, 0)];
    const [nx, nz] = rows[Math.min(row + 1, rows.length - 1)];
    const length = Math.hypot(nx - px, nz - pz) || 1;
    const sideX = -(nz - pz) / length;
    const sideZ = (nx - px) / length;
    for (let column = 0; column < across; column++) {
      const offset = -halfWidth + (2 * halfWidth * column) / (across - 1);
      positions.push(x + sideX * offset, 0, z + sideZ * offset);
    }
  });

  const index: number[] = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < across - 1; column++) {
      const a = row * across + column;
      const b = a + across;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
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
#ifdef WATER_FLOW
  uniform vec2 flow;
#endif

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
  #ifdef WATER_FLOW
    p -= flow * time;
  #endif
  vec3 normal = rippleNormal(p);

  vec3 toCamera = cameraPosition - vWorld;
  float camDist = length(toCamera);
  vec3 viewDir = toCamera / max(camDist, 1e-4);
  float cosTheta = max(dot(viewDir, normal), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - cosTheta, 5.0);
  #ifdef WATER_REFLECTION
    fresnel *= WATER_REFLECTION;
  #endif

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

  #ifndef WATER_BANK_FOG
    colour = atmosphereFog(colour, vWorld, sunDirection, sunColor, heightFog);
  #endif

  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef WATER_BANK_FOG
    // Where Three's own fog chunk sits in every standard material: see WaterOptions.bankFog.
    gl_FragColor.rgb = atmosphereFog(gl_FragColor.rgb, vWorld, sunDirection, sunColor, heightFog);
  #endif
}
`;

function waterMaterial(options: WaterOptions, detail: 0 | 1 | 2): ShaderMaterial {
  const { shared, mood, colours, flow, reflection, bankFog } = options;
  // Only a flowing surface declares the current, so a pond's program is the one it always was.
  const current: { defines: Record<string, string>; uniforms: Record<string, IUniform> } = flow
    ? { defines: { WATER_FLOW: '' }, uniforms: { flow: { value: new Vector2(flow[0], flow[1]) } } }
    : { defines: {}, uniforms: {} };
  // The ground haze, where the world has one: the water lies under it like the bank beside it.
  const haze = groundHazeProgram(shared.groundHaze, { linear: !bankFog });
  // Three refreshes `fogColor`, `fogNear` and `fogFar` from `scene.fog` on any material with
  // `fog: true` that declares them, so the water follows the same fog the terrain does.
  return new ShaderMaterial({
    name: 'water',
    defines: {
      WATER_LAYERS: detail + 1,
      ...current.defines,
      ...(reflection === undefined ? {} : { WATER_REFLECTION: reflection.toFixed(3) }),
      ...(bankFog ? { WATER_BANK_FOG: '' } : {}),
      ...haze.defines,
    },
    uniforms: {
      ...current.uniforms,
      ...haze.uniforms,
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

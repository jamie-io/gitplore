import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Mood } from './mood';
import { Motes } from './motes';
import { ATMOSPHERE_FOG_GLSL } from './shaders/atmosphere';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { groundHazeProgram } from './shaders/ground-haze';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface WaterfallOptions {
  readonly shared: SharedUniforms;
  /** Its sky's horizon is what the glassy water between the streaks mirrors at a glancing angle. */
  readonly mood: Mood;
  /** Centre of the lip the water pours over, world space. */
  readonly lip: readonly [number, number, number];
  readonly width: number;
  /** Metres from the lip down to the pool surface. */
  readonly drop: number;
  /** Yaw of the direction the water falls away from the rock; 0 = towards +Z. */
  readonly rotationY: number;
  readonly colours: { readonly water: number; readonly foam: number };
}

/** Horizontal speed of the water as it leaves the lip: what makes the sheet lean out, m/s. */
const LIP_SPEED = 1.2;
const GRAVITY = 9.81;
/** Rows down the sheet per `shaderDetail` tier; the bend at the top needs most of them. */
const ROWS: readonly [number, number, number] = [10, 16, 24];
const COLUMNS = 8;
/** How fast the streaks fall at the lip, m/s; they speed up on the way down. */
const FALL_SPEED = 3;
/** Metres of fall over which the sheet turns from glassy to white. */
const AERATION_METRES = 0.9;
/** The foam sits this far above the pool so it draws over the pond's own surface. */
const FOAM_LIFT = 0.03;
/** Mist puffs on the high tier, scaled by the tier's density. */
const MIST_COUNT = 90;
/**
 * Brightness of one mist puff, with the post stack and without. Additive points onto the 8-bit
 * sRGB canvas are encoded before they are added, and the encoding is steepest near black, so the
 * same faint puff adds several times more there than in the post stack's linear target: without
 * the stack the mist needs a much smaller glow to stay a haze instead of a pile of cotton balls.
 */
const MIST_GLOW = { post: 0.08, direct: 0.02 } as const;
/** How far above 1 the streak rims glint on the high tier, for its bloom to catch. */
const HDR_HIGHLIGHT = 1.4;
/**
 * How much of the streak rims' HDR highlight survives without the post stack: there is no bloom
 * to catch it and the 8-bit canvas would only clip it to white.
 */
const DIRECT_HIGHLIGHT = 0.3;

function highlightFor(ctx: WorldContext): number {
  return ctx.quality.postProcessing ? HDR_HIGHLIGHT : DIRECT_HIGHLIGHT;
}

/**
 * The lean of the sheet: gravity on water leaving the lip at `LIP_SPEED`. A parabola bends out
 * over the first metres and is all but vertical below, which is the shape the plan asks for.
 */
function leanAt(drop: number): number {
  return LIP_SPEED * Math.sqrt((2 * drop) / GRAVITY);
}

/**
 * A sheet `width` across from the lip at the origin, leaning out along +Z as it falls to
 * y = −drop. `uv.y` runs from 0 at the lip to 1 at the pool, so the fragment shader knows how far
 * each point has fallen.
 */
function sheetGeometry(width: number, drop: number, rows: number): BufferGeometry {
  const lean = leanAt(drop);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    // The row is where the parabola is at t of the fall time: exactly the lip at 0, exactly the
    // pool at 1.
    const y = -drop * t * t;
    const z = lean * t;
    for (let column = 0; column <= COLUMNS; column++) {
      const u = column / COLUMNS;
      positions.push((u - 0.5) * width, y, z);
      uvs.push(u, t);
    }
  }
  const stride = COLUMNS + 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const a = row * stride + column;
      const b = a + stride;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalWorld;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Both materials are ShaderMaterials with no fog chunk for `withAtmosphere` to patch, so like the
// pond they declare Three's fog uniforms and call the atmosphere's own function: the falls must
// haze exactly like the cliff behind them.
const FRAGMENT_PRELUDE = /* glsl */ `
${NOISE_GLSL}
uniform float time;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 heightFog;
uniform vec3 waterColor;
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

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalWorld;

${ATMOSPHERE_FOG_GLSL}`;

/**
 * The falling sheet. Streaks are value noise scrolling down the sheet, stretched long along the
 * fall and narrow across it: the coordinate along the fall is compressed with depth so the same
 * noise falls faster lower down, as water does, without the pattern shearing over time. Between
 * the streaks the water is glassy, darker and see-through, mirroring the sky at a glancing angle;
 * the streaks turn white as the water aerates on the way down. Each streak is brightest along its
 * edges, and only those edges go above 1, so the high tier's bloom catches the glints rather than
 * the whole sheet.
 */
const SHEET_FRAGMENT_SHADER = /* glsl */ `
${FRAGMENT_PRELUDE}
uniform float drop;
uniform float sheetWidth;
uniform float highlight;
uniform vec3 skyColor;

void main() {
  float fallen = vUv.y * drop;
  // f(m) = 8 (sqrt(1 + m / 4) − 1): f'(0) = 1, so the streaks pass at FALL_SPEED at the lip and
  // at FALL_SPEED · sqrt(1 + m / 4) after m metres.
  float stretched = 8.0 * (sqrt(1.0 + fallen * 0.25) - 1.0);
  float across = vUv.x * sheetWidth;
  float falling = stretched - time * ${FALL_SPEED.toFixed(1)};
  float n = noise2(vec2(across * 2.8, falling * 0.3));
  #if FALL_LAYERS > 1
    n = 0.6 * n + 0.4 * noise2(vec2(across * 5.3 + 7.1, falling * 0.7 + 3.3));
  #endif
  // Value noise crowds around 0.5, so a threshold above it leaves the glassy gaps room.
  float streak = smoothstep(0.46, 0.66, n);
  // 1 halfway up a streak's edge, 0 in the glassy gap and in the streak's middle.
  float rim = 4.0 * streak * (1.0 - streak);
  float aerated = smoothstep(0.0, ${AERATION_METRES.toFixed(2)}, fallen);

  vec3 normal = normalize(vNormalWorld);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float glancing = 1.0 - abs(dot(normal, toCamera));
  vec3 glass = mix(waterColor * 0.45, skyColor, 0.2 + 0.5 * glancing * glancing * glancing);
  vec3 colour = mix(glass, foamColor * 0.86, streak * (0.4 + 0.6 * aerated));
  // A sheet of falling water is translucent: it glows whichever side the sun is on.
  float sheen = abs(dot(normal, sunDirection));
  colour *= 0.85 + 0.15 * sheen;
  colour += sunColor * rim * rim * aerated * highlight;

  float alpha = mix(0.3 + 0.25 * aerated, 0.95, streak);
  // Glassy and thin right at the lip; ragged along both sides.
  alpha *= smoothstep(0.0, 0.05, vUv.y);
  float side = abs(vUv.x - 0.5) * 2.0;
  alpha *= 1.0 - smoothstep(0.7, 1.0, side) * (1.0 - 0.7 * streak);

  colour = atmosphereFog(colour, vWorld, sunDirection, sunColor, heightFog);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The foam where the water lands: a disc on the pool that billows on noise and surges outward in
 * rings from the impact, solid in the middle and lace towards its edge.
 */
const FOAM_FRAGMENT_SHADER = /* glsl */ `
${FRAGMENT_PRELUDE}

void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float edge = 1.0 - smoothstep(0.35, 1.0, r);
  vec2 p = vWorld.xz;
  float billow = noise2(p * 1.8 + vec2(time * 0.35, -time * 0.25));
  #if FALL_LAYERS > 1
    billow = 0.6 * billow + 0.4 * noise2(p * 4.5 - vec2(time * 0.6, time * 0.4));
  #endif
  float surge = 0.5 + 0.5 * sin(r * 9.0 - time * 2.5);
  float lace = smoothstep(0.3, 0.7, billow + 0.2 * surge * edge);
  float alpha = max(edge * lace, edge * edge * 0.7);

  // Just short of 1 even at its brightest: the foam glows in the haze but leaves bloom to the rims.
  vec3 colour = foamColor * (0.74 + 0.16 * billow);
  colour = atmosphereFog(colour, vWorld, sunDirection, sunColor, heightFog);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * A waterfall: a curved sheet from the lip, foam where it lands, and a cloud of mist over the
 * landing. Everything that moves reads `SharedUniforms.time`, so reduced motion stills the falls
 * with the rest of the world, and everything it adds it removes in `dispose()`.
 */
export class Waterfall implements WorldObject {
  readonly id = 'waterfall';

  private group?: Group;
  private highlight?: { value: number };
  private mist?: Motes;
  /** Whether the mist was built for the post stack; the tier can change under a running world. */
  private mistForPost = false;
  /** Where the sheet meets the pool, world space. */
  private readonly landing: { readonly x: number; readonly y: number; readonly z: number };

  constructor(private readonly options: WaterfallOptions) {
    const { lip, drop, rotationY } = options;
    const lean = leanAt(drop);
    this.landing = {
      x: lip[0] + Math.sin(rotationY) * lean,
      y: lip[1] - drop,
      z: lip[2] + Math.cos(rotationY) * lean,
    };
  }

  init(ctx: WorldContext): void {
    const { lip, width, drop, rotationY, shared, colours, mood } = this.options;
    const detail = ctx.quality.shaderDetail;
    this.highlight = { value: highlightFor(ctx) };
    // The foot of the falls stands in the ground haze, where the world has one; the falls fog
    // before their tone mapping, in linear light.
    const haze = groundHazeProgram(shared.groundHaze, { linear: true });
    const uniforms = () => ({
      ...UniformsUtils.clone(UniformsLib.fog),
      ...haze.uniforms,
      time: shared.time,
      sunDirection: shared.sunDirection,
      sunColor: shared.sunColor,
      heightFog: shared.heightFog,
      waterColor: { value: new Color(colours.water) },
      foamColor: { value: new Color(colours.foam) },
    });
    const layers = detail === 0 ? 1 : 2;

    const sheet = new Mesh(
      sheetGeometry(width, drop, ROWS[detail]),
      new ShaderMaterial({
        name: 'waterfall-sheet',
        defines: { FALL_LAYERS: layers, ...haze.defines },
        uniforms: {
          ...uniforms(),
          drop: { value: drop },
          sheetWidth: { value: width },
          highlight: this.highlight,
          skyColor: { value: new Color(mood.sky.horizon) },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: SHEET_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: true,
      }),
    );
    sheet.name = 'waterfall-sheet';

    const foam = new Mesh(
      new CircleGeometry(1, detail === 0 ? 16 : 28).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        name: 'waterfall-foam',
        defines: { FALL_LAYERS: layers, ...haze.defines },
        uniforms: uniforms(),
        vertexShader: VERTEX_SHADER,
        fragmentShader: FOAM_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    foam.name = 'waterfall-foam';
    foam.position.set(0, -drop + FOAM_LIFT, leanAt(drop));
    foam.scale.set(width * 0.95, 1, width * 0.6);
    // Over the pond's own surface, which draws in the same transparent pass at the same depth.
    foam.renderOrder = 1;

    const group = new Group();
    group.name = this.id;
    group.position.set(lip[0], lip[1], lip[2]);
    group.rotation.y = rotationY;
    group.add(sheet, foam);
    group.updateMatrixWorld(true);

    this.group = group;
    ctx.scene.add(group);
    this.buildMist(ctx);
  }

  update(_dt: number, ctx: WorldContext): void {
    // The streaks, foam and mist all move in their shaders on the shared clock. Only the glint
    // follows the tier, which can change under a running world.
    const highlight = highlightFor(ctx);
    if (this.highlight && this.highlight.value !== highlight) {
      this.highlight.value = highlight;
    }
    if (this.mist && this.mistForPost !== ctx.quality.postProcessing) {
      this.mist.dispose();
      this.buildMist(ctx);
    }
  }

  dispose(): void {
    if (this.group) {
      disposeObject3D(this.group);
      this.group = undefined;
    }
    this.highlight = undefined;
    this.mist?.dispose();
    this.mist = undefined;
  }

  /** A small `Motes` cloud hanging over the landing, as bright as the tier's blending allows. */
  private buildMist(ctx: WorldContext): void {
    const { width, shared, colours } = this.options;
    this.mistForPost = ctx.quality.postProcessing;
    this.mist = new Motes({
      shared,
      seed: 7331,
      count: MIST_COUNT,
      area: {
        x: this.landing.x,
        z: this.landing.z,
        radius: width * 0.7,
        minY: this.landing.y - 0.1,
        maxY: this.landing.y + 2.6,
      },
      followCamera: false,
      colour: colours.foam,
      // Few, wide and faint, so they overlap into a haze rather than read as sparks.
      size: 1.1,
      glow: this.mistForPost ? MIST_GLOW.post : MIST_GLOW.direct,
      drift: 1.2,
      flicker: 0,
    });
    this.mist.init(ctx);
  }
}

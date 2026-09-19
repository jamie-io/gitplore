import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Motes } from './motes';
import { between, seededRandom } from './random';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface FountainJetsOptions {
  readonly shared: SharedUniforms;
  /** Where the jets leave the spout. */
  readonly origin: readonly [number, number, number];
  readonly jets: number;
  /** Horizontal metres an arc travels before it lands. */
  readonly reach: number;
  /** Metres an arc rises above the origin at its peak. */
  readonly height: number;
  /** The y where arcs end: the surface they fall into. */
  readonly landing: number;
  readonly colour: number;
}

/** Tube segments along each arc and sides around it, per `shaderDetail` tier. */
const SEGMENTS: readonly [number, number, number] = [12, 20, 28];
const SIDES: readonly [number, number, number] = [4, 5, 6];
/** Tube radius at the spout and where it lands: a jet spreads as it breaks up. */
const RADIUS_START = 0.03;
const RADIUS_END = 0.07;
/** The splash ring on the water around each landing point, metres. */
const SPLASH_INNER = 0.04;
const SPLASH_OUTER = 0.6;
const SPLASH_SEGMENTS = 18;
/** How far above the water the splash ring floats, so it never fights the surface for depth. */
const SPLASH_LIFT = 0.02;
/** Spray per landing point on the high tier (twice that for the low tier's single cloud); `Motes` scales it down by tier. */
const SPRAY_COUNT = 36;
const SEED = 2207;

const JET_VERTEX_SHADER = /* glsl */ `
attribute vec2 aArc;
varying vec2 vArc;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vArc = aArc;
  vNormal = mat3(modelMatrix) * normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// A tube would read as a glass pipe if it were solid to its silhouette, so the body is weighted by
// how squarely each point faces the eye: the middle is water, the rim is air. Streaks of noise
// scroll down the arc on the shared clock, which is what makes the water look like it is moving.
const JET_FRAGMENT_SHADER = /* glsl */ `
${NOISE_GLSL}
uniform float time;
uniform vec3 colour;
uniform vec3 sunDirection;
uniform vec3 sunColor;
varying vec2 vArc;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  float t = vArc.x;
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);

  float along = t * 9.0 - time * 2.4;
  float streak = noise2(vec2(along, vArc.y * 37.0 + 2.0)) * 0.65
    + noise2(vec2(along * 2.7 + 5.0, vArc.y * 53.0)) * 0.35;
  streak = smoothstep(0.3, 0.85, streak);

  float facing = abs(dot(n, viewDir));
  float body = facing * facing;
  float head = smoothstep(0.0, 0.06, t);
  float tail = 1.0 - smoothstep(0.88, 1.0, t);
  // The jet whitens as it breaks up on the way down.
  float froth = smoothstep(0.35, 1.0, t);
  // A glint where the sun mirrors off the water; above 1 so the high tier's bloom catches it.
  float glint = pow(max(dot(reflect(-viewDir, n), sunDirection), 0.0), 24.0);

  vec3 water = colour * (0.35 + 0.65 * streak) * (1.0 + 0.35 * froth);
  water += sunColor * glint * 0.8 * facing;
  float alpha = body * head * tail * (0.35 + 0.5 * streak);
  gl_FragColor = vec4(water * alpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SPLASH_VERTEX_SHADER = /* glsl */ `
attribute vec2 aSplash;
varying vec2 vSplash;

void main() {
  vSplash = aSplash;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Rings running outward from each impact and a flickering white core where the jet hits.
const SPLASH_FRAGMENT_SHADER = /* glsl */ `
${NOISE_GLSL}
uniform float time;
uniform vec3 colour;
varying vec2 vSplash;

void main() {
  float r = vSplash.x;
  float wave = fract(r * 2.5 - time * 1.1 + vSplash.y);
  float ring = smoothstep(0.55, 0.85, wave) * (1.0 - smoothstep(0.85, 1.0, wave));
  float fade = pow(1.0 - r, 1.6);
  float core = (1.0 - smoothstep(0.0, 0.25, r))
    * (0.6 + 0.4 * noise2(vec2(time * 3.0, vSplash.y * 40.0)));
  float alpha = ring * 0.35 * fade + core * 0.6;
  gl_FragColor = vec4(colour * alpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The live water of a fountain: parabolic jets from the spout, each a thin tube with streaks
 * scrolling down it, landing in a ring of shimmer on the basin and a puff of spray. Every motion
 * runs in the shaders on `SharedUniforms.time`, so the CPU does nothing per frame and reduced
 * motion holds the water still with the rest of the world.
 */
export class FountainJets implements WorldObject {
  readonly id = 'fountain-jets';

  private jets?: Mesh;
  private splash?: Mesh;
  private spray: Motes[] = [];

  constructor(private readonly options: FountainJetsOptions) {}

  init(ctx: WorldContext): void {
    const { shared, origin } = this.options;
    const detail = ctx.quality.shaderDetail;
    const arcs = this.arcs();

    const jets = new Mesh(
      jetGeometry(arcs, SEGMENTS[detail], SIDES[detail]),
      new ShaderMaterial({
        name: 'fountain-jets',
        uniforms: {
          time: shared.time,
          sunDirection: shared.sunDirection,
          sunColor: shared.sunColor,
          colour: { value: new Color(this.options.colour) },
        },
        vertexShader: JET_VERTEX_SHADER,
        fragmentShader: JET_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    jets.name = 'fountain-jets';
    jets.position.set(origin[0], origin[1], origin[2]);

    const splash = new Mesh(
      splashGeometry(arcs),
      new ShaderMaterial({
        name: 'fountain-splash',
        uniforms: {
          time: shared.time,
          colour: { value: new Color(this.options.colour) },
        },
        vertexShader: SPLASH_VERTEX_SHADER,
        fragmentShader: SPLASH_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    splash.name = 'fountain-splash';
    splash.position.set(origin[0], origin[1], origin[2]);

    this.spray = spraySpots(arcs, detail).map(
      (spot, i) =>
        new Motes({
          shared,
          seed: SEED + i,
          count: spot.count,
          area: {
            x: origin[0] + spot.x,
            z: origin[2] + spot.z,
            radius: spot.radius,
            minY: this.options.landing + SPLASH_LIFT,
            maxY: this.options.landing + 0.9,
          },
          followCamera: false,
          colour: 0xffffff,
          size: 0.035,
          glow: 1.3,
          drift: 0.35,
          flicker: 0.6,
        }),
    );

    this.jets = jets;
    this.splash = splash;
    ctx.scene.add(jets, splash);
    this.spray.forEach((motes) => motes.init(ctx));
  }

  update(): void {
    // The streaks, rings and spray all move in the shaders on the shared clock.
  }

  dispose(): void {
    if (this.jets) {
      disposeObject3D(this.jets);
      this.jets = undefined;
    }
    if (this.splash) {
      disposeObject3D(this.splash);
      this.splash = undefined;
    }
    this.spray.forEach((motes) => motes.dispose());
    this.spray = [];
  }

  /** One arc per jet, fanned evenly, each a touch longer or higher than the next so they never read as stamped. */
  private arcs(): Arc[] {
    const { jets, reach, height, origin, landing } = this.options;
    const random = seededRandom(SEED);
    const drop = origin[1] - landing;
    return Array.from({ length: jets }, (_, i) => {
      const angle = ((i + 0.5) / jets) * Math.PI * 2;
      return parabola(
        new Vector3(Math.cos(angle), 0, Math.sin(angle)),
        reach * between(random, 0.97, 1.03),
        height * between(random, 0.96, 1.04),
        drop,
        i / jets,
      );
    });
  }
}

/**
 * Where the spray hangs, relative to the spout. Each cloud is a draw call, and the software
 * renderer behind the low tier pays for every one as if it were large, so that tier gets a
 * single mist over the whole basin; the others get a puff where each jet lands.
 */
function spraySpots(
  arcs: readonly Arc[],
  detail: 0 | 1 | 2,
): { readonly x: number; readonly z: number; readonly radius: number; readonly count: number }[] {
  if (detail === 0) {
    const reach = Math.max(...arcs.map((arc) => arc.reach));
    return arcs.length ? [{ x: 0, z: 0, radius: reach + 0.35, count: SPRAY_COUNT * 2 }] : [];
  }
  return arcs.map((arc) => ({
    x: arc.direction.x * arc.reach,
    z: arc.direction.z * arc.reach,
    radius: 0.4,
    count: SPRAY_COUNT,
  }));
}

/** A jet's path relative to the spout: `at(t)` for t in [0, 1] along its horizontal run. */
interface Arc {
  readonly direction: Vector3;
  readonly reach: number;
  readonly phase: number;
  at(t: number): Vector3;
  tangent(t: number): Vector3;
}

/**
 * y(t) = v·t − g·t² over the horizontal fraction t, with the peak `height` above the spout and
 * the end `drop` below it: solving both fixes g = drop + 2h + 2√(h² + h·drop), and the larger root
 * is the one whose peak lies inside the run.
 */
function parabola(
  direction: Vector3,
  reach: number,
  height: number,
  drop: number,
  phase: number,
): Arc {
  const g = drop + 2 * height + 2 * Math.sqrt(height * height + height * drop);
  const v = g - drop;
  return {
    direction,
    reach,
    phase,
    at: (t) => new Vector3(direction.x * reach * t, v * t - g * t * t, direction.z * reach * t),
    tangent: (t) =>
      new Vector3(direction.x * reach, v - 2 * g * t, direction.z * reach).normalize(),
  };
}

/** Every arc as one indexed tube mesh, with the run fraction and jet phase on each vertex. */
function jetGeometry(arcs: readonly Arc[], segments: number, sides: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const arcAttribute: number[] = [];
  const index: number[] = [];
  const side = new Vector3();
  const up = new Vector3();
  const radial = new Vector3();

  arcs.forEach((arc) => {
    const base = positions.length / 3;
    // The ring basis: a horizontal vector across the arc, and the one perpendicular to both it
    // and the tangent, so the tube follows the curve without twisting.
    side.set(-arc.direction.z, 0, arc.direction.x);
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const centre = arc.at(t);
      up.crossVectors(arc.tangent(t), side).normalize();
      const radius = RADIUS_START + (RADIUS_END - RADIUS_START) * t;
      for (let k = 0; k < sides; k++) {
        const angle = (k / sides) * Math.PI * 2;
        radial.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
        positions.push(
          centre.x + radial.x * radius,
          centre.y + radial.y * radius,
          centre.z + radial.z * radius,
        );
        normals.push(radial.x, radial.y, radial.z);
        arcAttribute.push(t, arc.phase);
      }
    }
    for (let s = 0; s < segments; s++) {
      for (let k = 0; k < sides; k++) {
        const a = base + s * sides + k;
        const b = base + s * sides + ((k + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        index.push(a, c, b, b, c, d);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aArc', new Float32BufferAttribute(arcAttribute, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A flat annulus on the water under every landing point, all in one mesh. */
function splashGeometry(arcs: readonly Arc[]): BufferGeometry {
  const positions: number[] = [];
  const splash: number[] = [];
  const index: number[] = [];

  arcs.forEach((arc) => {
    const base = positions.length / 3;
    const landing = arc.at(1);
    const y = landing.y + SPLASH_LIFT;
    for (const [radius, radial] of [
      [SPLASH_INNER, 0],
      [SPLASH_OUTER, 1],
    ]) {
      for (let s = 0; s < SPLASH_SEGMENTS; s++) {
        const angle = (s / SPLASH_SEGMENTS) * Math.PI * 2;
        positions.push(
          landing.x + Math.cos(angle) * radius,
          y,
          landing.z + Math.sin(angle) * radius,
        );
        splash.push(radial, arc.phase);
      }
    }
    for (let s = 0; s < SPLASH_SEGMENTS; s++) {
      const next = (s + 1) % SPLASH_SEGMENTS;
      const inner = base + s;
      const outer = base + SPLASH_SEGMENTS + s;
      index.push(
        inner,
        base + SPLASH_SEGMENTS + next,
        outer,
        inner,
        base + next,
        base + SPLASH_SEGMENTS + next,
      );
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSplash', new Float32BufferAttribute(splash, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

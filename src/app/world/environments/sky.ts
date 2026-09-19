import { BackSide, Color, Fog, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Mood } from './mood';
import { NOISE_GLSL } from './shaders/noise.glsl';
import { SharedUniforms } from './shaders/shared-uniforms';

export interface SkyOptions {
  readonly mood: Mood;
  readonly shared: SharedUniforms;
}

/** Octaves of cloud detail per tier; the low tier compiles the clouds out altogether. */
const CLOUD_OCTAVES: Readonly<Record<1 | 2, number>> = { 1: 4, 2: 7 };

/**
 * The gradient dome, the sun disc and the clouds, drawn at the far plane so only the pixels nothing
 * else covers pay for the fragment shader. It also owns the scene's fog and background, since both
 * are the same air the dome shows; the lights belong to `Sun`.
 */
export class Sky implements WorldObject {
  readonly id = 'sky';

  private dome: Mesh<SphereGeometry, ShaderMaterial> | null = null;
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: SkyOptions) {}

  init(ctx: WorldContext): void {
    const { mood } = this.options;
    const { scene, camera, quality } = ctx;

    this.scene = scene;
    scene.fog = new Fog(mood.fog.color, mood.fog.near, Math.min(mood.fog.far, quality.fogFar));
    // Nothing shows through the dome, but a clear colour matching the fog keeps the one frame
    // before the dome is in place from flashing black.
    scene.background = new Color(mood.fog.color);

    const radius = Math.min(quality.fogFar * 1.2, camera.far * 0.9);
    this.dome = new Mesh(
      new SphereGeometry(radius, 32, 20),
      skyMaterial(mood, this.options.shared, quality.shaderDetail),
    );
    this.dome.name = 'sky-dome';
    this.dome.frustumCulled = false;
    // Last among the opaques, so the depth test discards every pixel the world already painted.
    this.dome.renderOrder = 1000;
    this.dome.position.set(camera.position.x, 0, camera.position.z);
    scene.add(this.dome);
  }

  /** Keeps the dome centred under the camera, so the horizon never slides as the visitor walks. */
  update(_dt: number, ctx: WorldContext): void {
    if (this.dome) {
      this.dome.position.set(ctx.camera.position.x, 0, ctx.camera.position.z);
    }
  }

  dispose(): void {
    if (this.dome) {
      disposeObject3D(this.dome);
      this.dome = null;
    }
    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
      this.scene = null;
    }
  }
}

function skyMaterial(mood: Mood, shared: SharedUniforms, detail: 0 | 1 | 2): ShaderMaterial {
  const clouds = mood.clouds;
  const defines: Record<string, string | number> = {};
  if (detail === 0) {
    defines['VERTEX_GRADIENT'] = '';
  }
  if (clouds && detail !== 0) {
    defines['CLOUDS'] = '';
    defines['FBM_OCTAVES'] = CLOUD_OCTAVES[detail];
  }

  return new ShaderMaterial({
    name: 'sky',
    side: BackSide,
    depthWrite: false,
    fog: false,
    defines,
    uniforms: {
      // The shared objects themselves, so the world's one update a frame moves the sun and the
      // clouds here too.
      sunDirection: shared.sunDirection,
      sunColor: shared.sunColor,
      time: shared.time,
      zenith: { value: new Color(mood.sky.zenith) },
      horizon: { value: new Color(mood.sky.horizon) },
      sunGlow: { value: new Color(mood.sky.sunGlow) },
      below: { value: new Color(mood.sky.below) },
      discSize: { value: mood.sun.discSize },
      cloudColor: { value: new Color(clouds?.color ?? 0xffffff) },
      cloudShade: { value: new Color(clouds?.shade ?? 0x808080) },
      // x coverage, y softness, z drift speed.
      cloudParams: {
        value: new Vector3(clouds?.coverage ?? 0, clouds?.softness ?? 0, clouds?.speed ?? 0),
      },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
}

// The gradient and the warm band on the sun's side: everything in the sky that changes slowly
// across the dome. The lowest tier evaluates it per vertex (the dome's 32 × 20 grid is fine enough
// for curves this broad), because the software renderer charges every sky pixel for every
// instruction; the other tiers evaluate it per pixel.
const GRADIENT_GLSL = /* glsl */ `
uniform vec3 sunDirection;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunGlow;
uniform vec3 below;

vec3 skyGradient(vec3 dir) {
  float altitude = dir.y;

  // Below the horizon, a band of horizon colour, then a curve up to the zenith.
  vec3 colour = mix(horizon, zenith, pow(clamp(altitude, 0.0, 1.0), 0.65));
  colour = mix(below, colour, smoothstep(-0.16, 0.0, altitude));

  // A warm band on the sun's side, hugging the horizon.
  vec2 level = normalize(dir.xz + vec2(1e-4, 0.0));
  vec2 sunLevel = normalize(sunDirection.xz + vec2(1e-4, 0.0));
  float sameSide = max(dot(level, sunLevel), 0.0);
  float band = pow(sameSide, 3.0) * exp(-max(altitude, 0.0) * 5.0) * smoothstep(-0.25, 0.0, altitude);
  return mix(colour, sunGlow, band * 0.8);
}
`;

// The dome only ever translates, so the local position is the view direction. Writing w into z
// pins every fragment to the far plane: with the default LessEqual depth test the sky then loses
// against anything the world drew, whatever the dome's radius.
const VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;
#ifdef VERTEX_GRADIENT
${GRADIENT_GLSL}
varying vec3 vGradient;
#endif
void main() {
  vDirection = position;
#ifdef VERTEX_GRADIENT
  vGradient = skyGradient(normalize(position));
#endif
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
${GRADIENT_GLSL}
uniform vec3 sunColor;
uniform float time;
uniform float discSize;
uniform vec3 cloudColor;
uniform vec3 cloudShade;
uniform vec3 cloudParams;
varying vec3 vDirection;
#ifdef VERTEX_GRADIENT
varying vec3 vGradient;
#endif

#ifdef CLOUDS
${NOISE_GLSL}

// Cumulus on a plane above the visitor: the projection stretches the noise towards the horizon
// the way perspective would a real cloud deck. Returns colour in rgb and cover in a.
vec4 clouds(vec3 dir, float toSun) {
  float coverage = cloudParams.x;
  float softness = cloudParams.y;
  vec2 uv = dir.xz / (dir.y + 0.15);
  // The mood's speed is in noise units per second; the deck is 2.4 units per uv unit, so the
  // 0.02 here turns "0.6" into a drift that reads as weather rather than a time-lapse.
  vec2 drift = vec2(1.0, 0.35) * time * cloudParams.z * 0.02;
  vec2 p = uv * 2.4 + drift;
  float threshold = mix(0.72, 0.3, coverage);
  float width = mix(0.05, 0.28, softness);
  float density = fbm2(p);
  float cover = smoothstep(threshold, threshold + width, density);
  float thick = smoothstep(threshold + width, threshold + width + 0.22, density);
  // Where the deck thins towards the sun, this is a lit edge; where it thickens, the shaded side.
  vec2 towardSun = normalize(sunDirection.xz + vec2(1e-4, 0.0)) * 0.12;
  float ahead = fbm2(p + towardSun);
  float lit = clamp((density - ahead) * 7.0, 0.0, 1.0) * (1.0 - thick);
  vec3 colour = mix(cloudColor, cloudShade, thick * 0.85);
  colour += sunColor * lit * (0.55 + 0.45 * max(toSun, 0.0));
  // Thin out into the haze before the plane projection stretches the noise into streaks.
  cover *= smoothstep(0.02, 0.24, dir.y);
  return vec4(colour, cover);
}
#endif

void main() {
  vec3 dir = normalize(vDirection);
  float toSun = dot(dir, sunDirection);

#ifdef VERTEX_GRADIENT
  vec3 colour = vGradient;
#else
  vec3 colour = skyGradient(dir);
#endif

  // The disc in HDR, a tight halo and a wide one; all measured in angle so they stay round.
  if (discSize > 0.0) {
#ifdef VERTEX_GRADIENT
    // The same three terms without acos: the chord to the sun stands in for the angle (4 % short
    // at a radian, where the wide halo is nearly gone), and the tight halo is written in 1 - cos,
    // which is angle² / 2 near the sun.
    float away = 1.0 - toSun;
    float angle = sqrt(2.0 * away);
    float tight = exp(-away / (4.0 * discSize * discSize));
#else
    float angle = acos(clamp(toSun, -1.0, 1.0));
    float tight = exp(-angle * angle / (8.0 * discSize * discSize));
#endif
    float wide = exp(-angle * 2.5);
    colour += sunGlow * wide * 0.45;
    colour += sunColor * tight * 1.2;
    float disc = 1.0 - smoothstep(discSize * 0.9, discSize, angle);
    colour += sunColor * disc * 6.0;
  }

#ifdef CLOUDS
  vec4 deck = clouds(dir, toSun);
  colour = mix(colour, deck.rgb, deck.a);
#endif

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

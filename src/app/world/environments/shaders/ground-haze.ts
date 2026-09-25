import {
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  IUniform,
  LinearFilter,
  RedFormat,
  Vector3,
  Vector4,
} from 'three';
import { BOWL } from '../jungle-bowl';
import type { ClearingUniforms } from './clearing-ring';

/**
 * The slop as it lies in the Lichtung: a violet haze hugging the ground of the bowl, dense on the
 * ground and gone 2.2 m above it, cleared around the lit lantern and inside Deslopify's ring.
 */
export const GROUND_HAZE = {
  /** Metres above the local ground where the haze has thinned to nothing. */
  top: 2.2,
  /** The slop violet, oklch(0.5 0.17 330). */
  color: 0x8e3f86,
  /** The haze's opacity on a long ray through it at full density: it never hides the view. */
  opacity: 0.42,
  /** How quickly a ray fills towards that opacity, per metre travelled at full density. */
  extinction: 0.35,
  /** Metres of a ray's way through the bowl the march covers, from where it enters. */
  reach: 60,
  /**
   * Samples along the ray, per shader detail: low, medium, high. The low tier's four hold the march
   * to about a sixth of a software-rendered frame at the portal; six took nearly a quarter.
   */
  steps: [4, 10, 16],
  /** The lantern's light clears it fully within this share of its radius, not at all beyond it. */
  lanternInner: 0.7,
  /** Metres beyond the ring's edge over which the haze comes back. */
  ringFade: 4,
  /** The bowl's ellipse, squared: the haze thins from here to the edge, so it has no hard border. */
  edgeFade: 0.8,
} as const;

/** The baked ground: 128 × 96 texels, half a metre apart, over the bowl and a strip of the rim. */
const BAKE = { cols: 128, rows: 96, minX: -32, minZ: -24, width: 64, depth: 48 } as const;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How dense the haze is `height` metres above the ground, 1 … 0: full on the ground (and under
 * it, where a filtered height can put a sample), thinning smoothly to nothing at `GROUND_HAZE.top`,
 * so the layer has no visible upper edge. The shader's `hazeDensity` computes the same.
 */
export function hazeDensity(height: number): number {
  return 1 - smoothstep(0, GROUND_HAZE.top, height);
}

/** Where the haze clears: the lantern's light and the ring, each (x, z, radius); 0 clears nothing. */
export interface HazeClearing {
  readonly light: { readonly x: number; readonly z: number; readonly radius: number };
  readonly ring: { readonly x: number; readonly z: number; readonly radius: number };
}

/**
 * How much haze lies over (x, z), 0 … 1: none outside the bowl, all of it inside, less where the
 * lantern or the ring clear it — the same rule that wipes the feed cards: clear within 0.7 R of the
 * lit lantern and whole again from R; clear inside the ring and whole again 4 m beyond it. The
 * shader's `hazeMask` computes the same.
 */
export function hazeMask(x: number, z: number, clearing: HazeClearing): number {
  const bowl = 1 - smoothstep(GROUND_HAZE.edgeFade, 1, (x / BOWL.rx) ** 2 + (z / BOWL.rz) ** 2);
  const { light, ring } = clearing;
  const lantern =
    light.radius >= 1e-3
      ? smoothstep(
          GROUND_HAZE.lanternInner * light.radius,
          light.radius,
          Math.hypot(x - light.x, z - light.z),
        )
      : 1;
  const cleared =
    ring.radius >= 1e-3
      ? smoothstep(
          ring.radius,
          ring.radius + GROUND_HAZE.ringFade,
          Math.hypot(x - ring.x, z - ring.z),
        )
      : 1;
  return bowl * Math.min(lantern, cleared);
}

/** The ground baked for the shader, and the heights that bound the haze over the bowl. */
export interface HazeGround {
  readonly texture: DataTexture;
  /** The world rectangle the texture covers, texel centres half a texel in from its edges. */
  readonly rect: {
    readonly minX: number;
    readonly minZ: number;
    readonly width: number;
    readonly depth: number;
  };
  /** The lowest ground inside the bowl. */
  readonly floor: number;
  /** `GROUND_HAZE.top` over the highest ground inside the bowl: no haze lies above it. */
  readonly ceiling: number;
}

/**
 * Bakes `heightAt` over the bowl and its rim into a one-channel half-float texture, sampled with
 * linear filtering. Half floats rather than full ones: Three runs on WebGL2 only, where a half-float
 * texture always filters, while a full float one needs `OES_texture_float_linear`, which many
 * mobile GPUs lack — so no byte-packed fallback is needed. A half float keeps a height of 20 m to
 * within 1 cm.
 */
export function bakeHazeGround(heightAt: (x: number, z: number) => number): HazeGround {
  const { cols, rows, minX, minZ, width, depth } = BAKE;
  const data = new Uint16Array(cols * rows);
  let floor = Infinity;
  let highest = -Infinity;
  for (let row = 0; row < rows; row++) {
    const z = minZ + ((row + 0.5) / rows) * depth;
    for (let col = 0; col < cols; col++) {
      const x = minX + ((col + 0.5) / cols) * width;
      const height = heightAt(x, z);
      data[row * cols + col] = DataUtils.toHalfFloat(height);
      if ((x / BOWL.rx) ** 2 + (z / BOWL.rz) ** 2 < 1) {
        floor = Math.min(floor, height);
        highest = Math.max(highest, height);
      }
    }
  }
  const texture = new DataTexture(data, cols, rows, RedFormat, HalfFloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    rect: { minX, minZ, width, depth },
    floor,
    ceiling: highest + GROUND_HAZE.top,
  };
}

export interface GroundHazeOptions {
  /** The ground the haze lies on: the terrain, or the water's surface where there is water. */
  readonly heightAt: (x: number, z: number) => number;
  /** The ring's centre and radius, shared by identity with the ring on the floor. */
  readonly clearing: Pick<ClearingUniforms, 'origin' | 'radius'>;
}

/**
 * The jungle's ground haze: its baked ground and the uniforms the atmosphere reads, handed to every
 * material by identity through `SharedUniforms.groundHaze`. The world writes the global slop amount
 * and the lantern's light each frame; the ring's uniforms are the clearing's own.
 */
export class GroundHaze {
  readonly uniforms: {
    readonly uHazeGround: { readonly value: DataTexture };
    /** x, z of the baked rectangle's corner, then one over its width and depth. */
    readonly uHazeRect: { readonly value: Vector4 };
    readonly uHazeBoxMin: { readonly value: Vector3 };
    readonly uHazeBoxMax: { readonly value: Vector3 };
    /** The lantern's light: x, z and radius, 0 while it is dark. */
    readonly uHazeLight: { readonly value: Vector3 };
    readonly uHazeClearOrigin: { readonly value: Vector3 };
    readonly uHazeClearRadius: { readonly value: number };
    readonly uHazeColor: { readonly value: Color };
    /** The global slop amount, 0 … 1: 0 draws no haze and skips the march. */
    readonly uHazeAmount: { value: number };
  };
  private stepCount: number = GROUND_HAZE.steps[0];

  constructor(options: GroundHazeOptions) {
    const { texture, rect, floor, ceiling } = bakeHazeGround(options.heightAt);
    this.uniforms = {
      uHazeGround: { value: texture },
      uHazeRect: { value: new Vector4(rect.minX, rect.minZ, 1 / rect.width, 1 / rect.depth) },
      uHazeBoxMin: { value: new Vector3(-BOWL.rx, floor, -BOWL.rz) },
      uHazeBoxMax: { value: new Vector3(BOWL.rx, ceiling, BOWL.rz) },
      uHazeLight: { value: new Vector3() },
      uHazeClearOrigin: options.clearing.origin,
      uHazeClearRadius: options.clearing.radius,
      // `new Color(hex)` converts the sRGB violet into the linear working space, like the fog's.
      uHazeColor: { value: new Color(GROUND_HAZE.color) },
      uHazeAmount: { value: 1 },
    };
  }

  /** Samples along each ray: set from the tier's shader detail before the world first draws. */
  get steps(): number {
    return this.stepCount;
  }

  setDetail(detail: 0 | 1 | 2): void {
    this.stepCount = GROUND_HAZE.steps[detail];
  }

  /** The global slop amount, clamped to 0 … 1. */
  setAmount(amount: number): void {
    this.uniforms.uHazeAmount.value = Math.min(Math.max(amount, 0), 1);
  }

  /** Where the lantern's light clears the haze; a radius of 0 (or less) clears nothing. */
  setLight(x: number, z: number, radius: number): void {
    this.uniforms.uHazeLight.value.set(x, z, Math.max(radius, 0));
  }

  dispose(): void {
    this.uniforms.uHazeGround.value.dispose();
  }
}

/**
 * What a `ShaderMaterial` that pastes `ATMOSPHERE_FOG_GLSL` (the water) adds to take the haze too:
 * the defines that switch it on and the uniforms by identity. Nothing for a world without one.
 * `linear` says the material calls `atmosphereFog` before its tone mapping and colour space
 * conversion rather than after them, where the standard materials fog.
 */
export function groundHazeProgram(
  haze: GroundHaze | null,
  options: { readonly linear?: boolean } = {},
): {
  readonly defines: Record<string, string | number>;
  readonly uniforms: Record<string, IUniform>;
} {
  if (!haze) {
    return { defines: {}, uniforms: {} };
  }
  return {
    defines: {
      GROUND_HAZE: '',
      HAZE_STEPS: haze.steps,
      ...(options.linear ? { HAZE_LINEAR: '' } : {}),
    },
    uniforms: { ...haze.uniforms },
  };
}

const f = (value: number) => value.toFixed(4);

/**
 * The haze term, compiled only where `GROUND_HAZE` is defined: `groundHaze(colour, worldPosition)`
 * marches `HAZE_STEPS` samples along the view ray where it crosses the box over the bowl (at most
 * `GROUND_HAZE.reach` metres of it), each reading the baked ground under it, and mixes the violet
 * in by the depth it gathered. The step count is a define, so the loop is a constant one; nothing
 * in it is WebGL2-only. `hazeDensity` and `hazeMask` mirror the TypeScript functions of that name.
 */
export const GROUND_HAZE_GLSL = /* glsl */ `
#ifdef GROUND_HAZE
uniform sampler2D uHazeGround;
uniform vec4 uHazeRect;
uniform vec3 uHazeBoxMin;
uniform vec3 uHazeBoxMax;
uniform vec3 uHazeLight;
uniform vec3 uHazeClearOrigin;
uniform float uHazeClearRadius;
uniform vec3 uHazeColor;
uniform float uHazeAmount;

float hazeDensity(float height) {
  return 1.0 - smoothstep(0.0, ${f(GROUND_HAZE.top)}, height);
}

float hazeMask(vec2 p) {
  vec2 e = p / vec2(${f(BOWL.rx)}, ${f(BOWL.rz)});
  float bowl = 1.0 - smoothstep(${f(GROUND_HAZE.edgeFade)}, 1.0, dot(e, e));
  float r = uHazeLight.z;
  // max() keeps the edges apart while the lantern is dark, where step() then discards the term.
  float lantern = mix(
    1.0,
    smoothstep(${f(GROUND_HAZE.lanternInner)} * r, max(r, 1e-3), distance(p, uHazeLight.xy)),
    step(1e-3, r)
  );
  float ring = mix(
    1.0,
    smoothstep(uHazeClearRadius, uHazeClearRadius + ${f(GROUND_HAZE.ringFade)}, distance(p, uHazeClearOrigin.xz)),
    step(1e-3, uHazeClearRadius)
  );
  return bowl * min(lantern, ring);
}

vec3 groundHaze(vec3 colour, vec3 worldPosition) {
  if (uHazeAmount <= 0.0) {
    return colour;
  }
  vec3 toFrag = worldPosition - cameraPosition;
  float dist = length(toFrag);
  vec3 dir = toFrag / max(dist, 1e-4);
  // The ray against the box over the bowl; an axis it runs along gets a tiny positive step instead.
  vec3 safeDir = mix(vec3(1e-5), dir, step(1e-5, abs(dir)));
  vec3 toMin = (uHazeBoxMin - cameraPosition) / safeDir;
  vec3 toMax = (uHazeBoxMax - cameraPosition) / safeDir;
  vec3 nearT = min(toMin, toMax);
  vec3 farT = max(toMin, toMax);
  float enter = max(max(nearT.x, nearT.y), max(nearT.z, 0.0));
  float leave = min(min(farT.x, farT.y), min(farT.z, dist));
  leave = min(leave, enter + ${f(GROUND_HAZE.reach)});
  if (leave <= enter) {
    return colour;
  }
  float stepLength = (leave - enter) / float(HAZE_STEPS);
  float depth = 0.0;
  for (int i = 0; i < HAZE_STEPS; i++) {
    vec3 p = cameraPosition + dir * (enter + (float(i) + 0.5) * stepLength);
    float ground = texture2D(uHazeGround, (p.xz - uHazeRect.xy) * uHazeRect.zw).r;
    depth += hazeDensity(p.y - ground) * hazeMask(p.xz);
  }
  float opacity = ${f(GROUND_HAZE.opacity)} * uHazeAmount
    * (1.0 - exp(-depth * stepLength * ${f(GROUND_HAZE.extinction)}));
  #ifdef HAZE_LINEAR
    vec3 violet = uHazeColor;
  #else
    // Standard materials fog after colorspace_fragment, in the output's colour space: the
    // violet goes there too, so it is the same violet drawn straight to the canvas or through
    // the high tier's linear post stack.
    vec3 violet = linearToOutputTexel(vec4(uHazeColor, 1.0)).rgb;
  #endif
  return mix(colour, violet, opacity);
}
#endif`;

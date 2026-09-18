import { Scene, Vector3 } from 'three';
import { ColorGrade, setGrade } from '@engine/color-grade';

/**
 * Everything about a world's light and air in one plain record: sky colours, where the sun stands,
 * the fog, the clouds, the wind and the final grade. The kit objects (sky, sun, water, grass, the
 * atmosphere shader) all read the same mood, so a world changes its whole time of day by swapping
 * one value instead of editing five classes. Colours are sRGB hex, angles radians, distances metres.
 */
export interface Mood {
  readonly sky: {
    /** Colour straight overhead. */
    readonly zenith: number;
    /** Colour at eye level all around. */
    readonly horizon: number;
    /** Colour of the glow around the sun disc. */
    readonly sunGlow: number;
    /** Colour below the horizon, where the ground would otherwise show the dome's inside. */
    readonly below: number;
  };
  readonly sun: {
    /** 0 = −Z (where `spawnYaw` 0 looks), positive towards +X. */
    readonly azimuth: number;
    /** 0 = on the horizon, π/2 = overhead. */
    readonly elevation: number;
    readonly color: number;
    /** `DirectionalLight` intensity. */
    readonly intensity: number;
    /** Radius of the visible disc as a fraction of the dome; 0 draws none. */
    readonly discSize: number;
  };
  readonly hemisphere: {
    readonly sky: number;
    readonly ground: number;
    readonly intensity: number;
  };
  readonly fog: {
    readonly color: number;
    /** Distance fog, as `scene.fog`. */
    readonly near: number;
    readonly far: number;
    /** Density of the height fog at y = 0; 0 turns it off. */
    readonly heightDensity: number;
    /** How quickly the height fog thins per metre of altitude. */
    readonly heightFalloff: number;
    /** 0 … 1: how much the fog warms towards the sun when looking into it. */
    readonly sunScatter: number;
  };
  /** `null` for a world without a visible sky. */
  readonly clouds: {
    /** 0 clear … 1 overcast. */
    readonly coverage: number;
    /** 0 hard-edged … 1 wispy. */
    readonly softness: number;
    /** Drift, in noise units per second. */
    readonly speed: number;
    readonly color: number;
    /** Colour of the unlit underside. */
    readonly shade: number;
  } | null;
  readonly wind: {
    /** 0 still … 1 a stiff breeze. */
    readonly strength: number;
    /** Spatial frequency of the gusts, per metre. */
    readonly gustScale: number;
    /** Direction the wind blows towards, radians, same convention as the sun azimuth. */
    readonly direction: number;
  };
  readonly grade: ColorGrade;
}

/** Golden late afternoon: a low warm sun front-right of the arrival view, peach haze in the hollows. */
export const LICHTUNG: Mood = {
  sky: { zenith: 0x4a7fc0, horizon: 0xf3d2a8, sunGlow: 0xffb070, below: 0xb9a58a },
  sun: { azimuth: 0.55, elevation: 0.32, color: 0xffd6a0, intensity: 2.6, discSize: 0.035 },
  hemisphere: { sky: 0x9cc3e0, ground: 0x7a7f45, intensity: 0.9 },
  fog: {
    color: 0xf0d3ae,
    near: 40,
    far: 320,
    heightDensity: 0.035,
    heightFalloff: 0.18,
    sunScatter: 0.6,
  },
  clouds: { coverage: 0.45, softness: 0.35, speed: 0.6, color: 0xfff3e0, shade: 0xc9a7a0 },
  wind: { strength: 0.6, gustScale: 0.04, direction: 0.9 },
  grade: { saturation: 1.08, contrast: 1.05, warmth: 0.08, vignette: 0.25, bloomStrength: 0.35 },
};

/** Humid: a high sun through a closed canopy, dense low teal fog with a glow where the sun is. */
export const DSCHUNGEL: Mood = {
  sky: { zenith: 0x5f8f7c, horizon: 0x9dbb8f, sunGlow: 0xe8ffc0, below: 0x3d5a45 },
  sun: { azimuth: -0.4, elevation: 1.05, color: 0xf2ffd0, intensity: 2.2, discSize: 0.03 },
  hemisphere: { sky: 0x9fd08a, ground: 0x3a4a2c, intensity: 1.1 },
  fog: {
    color: 0x7fa38a,
    near: 4,
    far: 90,
    heightDensity: 0.12,
    heightFalloff: 0.25,
    sunScatter: 0.8,
  },
  clouds: null,
  wind: { strength: 0.25, gustScale: 0.03, direction: 0.3 },
  grade: { saturation: 1.12, contrast: 1.08, warmth: -0.02, vignette: 0.35, bloomStrength: 0.5 },
};

/** Mediterranean noon: high sun, crisp shadows, azure sky, barely any haze. */
export const PLAZA: Mood = {
  sky: { zenith: 0x2f6fc4, horizon: 0xbfe0f2, sunGlow: 0xfff4d6, below: 0xd8cbb4 },
  sun: { azimuth: -0.7, elevation: 1.0, color: 0xfff4e0, intensity: 3.2, discSize: 0.03 },
  hemisphere: { sky: 0xbfe0f2, ground: 0xd8c7a8, intensity: 0.8 },
  fog: {
    color: 0xcfe6f2,
    near: 60,
    far: 320,
    heightDensity: 0.01,
    heightFalloff: 0.1,
    sunScatter: 0.25,
  },
  clouds: { coverage: 0.25, softness: 0.3, speed: 0.4, color: 0xffffff, shade: 0xb8c8d8 },
  wind: { strength: 0.4, gustScale: 0.05, direction: -0.6 },
  grade: { saturation: 1.1, contrast: 1.06, warmth: 0.03, vignette: 0.2, bloomStrength: 0.25 },
};

/** The gallery: no sky, no wind, no haze; a soft white key light from above and a dark surround. */
export const GALERIE: Mood = {
  sky: { zenith: 0x15181d, horizon: 0x1a1d22, sunGlow: 0x1a1d22, below: 0x101216 },
  sun: { azimuth: 0.5, elevation: 1.2, color: 0xfff6e8, intensity: 1.6, discSize: 0 },
  hemisphere: { sky: 0xffffff, ground: 0x3a4049, intensity: 1.2 },
  fog: { color: 0x1a1d22, near: 60, far: 140, heightDensity: 0, heightFalloff: 0, sunScatter: 0 },
  clouds: null,
  wind: { strength: 0, gustScale: 0, direction: 0 },
  grade: { saturation: 1.0, contrast: 1.04, warmth: 0.02, vignette: 0.3, bloomStrength: 0.3 },
};

/**
 * Unit vector from the ground towards the sun. Azimuth 0 = −Z (where `spawnYaw` 0 looks),
 * positive towards +X, so a positive azimuth puts the sun to the arriving visitor's right.
 */
export function sunDirection(mood: Mood): Vector3 {
  const { azimuth, elevation } = mood.sun;
  const flat = Math.cos(elevation);
  return new Vector3(
    Math.sin(azimuth) * flat,
    Math.sin(elevation),
    -Math.cos(azimuth) * flat,
  ).normalize();
}

/**
 * Sets the scene's colour grade for the post stack. Sky, fog and lights are the kit objects'
 * business; the grade is the one part of a mood that lives on the scene itself, because the post
 * stack reads it from there without knowing which world is showing.
 */
export function applyMood(scene: Scene, mood: Mood): void {
  setGrade(scene, mood.grade);
}

/** Removes the grade `applyMood` set, so the next world starts from neutral. */
export function clearMood(scene: Scene): void {
  setGrade(scene, null);
}

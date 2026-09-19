import { Scene } from 'three';

/**
 * How a scene wants its final image graded. The post stack (strongest tier only) reads it every
 * frame from `scene.userData`, which is the one channel between a world and the engine that needs
 * no engine API: the engine still knows nothing about which world is showing.
 */
export interface ColorGrade {
  /** 1 leaves saturation unchanged. */
  readonly saturation: number;
  /** 1 leaves contrast unchanged. */
  readonly contrast: number;
  /** −1 cool … +1 warm; 0 leaves the white balance alone. */
  readonly warmth: number;
  /** 0 none … 1 strong darkening towards the corners. */
  readonly vignette: number;
  /** `UnrealBloomPass` strength. */
  readonly bloomStrength: number;
}

export const NEUTRAL_GRADE: ColorGrade = {
  saturation: 1,
  contrast: 1,
  warmth: 0,
  vignette: 0.2,
  bloomStrength: 0.3,
};

export const GRADE_KEY = 'colorGrade';

/** The grade `scene` asked for, or the neutral one. */
export function gradeOf(scene: Scene): ColorGrade {
  return (scene.userData[GRADE_KEY] as ColorGrade | undefined) ?? NEUTRAL_GRADE;
}

/** Records `grade` on the scene; `null` removes it, as every environment must on dispose. */
export function setGrade(scene: Scene, grade: ColorGrade | null): void {
  if (grade) {
    scene.userData[GRADE_KEY] = grade;
  } else {
    delete scene.userData[GRADE_KEY];
  }
}

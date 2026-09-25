/**
 * The few numbers of the Lichtung that code shared by every world needs: the bowl the ground haze
 * lies in and the glade the star lanterns drift over. They live apart from `jungle-layout.ts`, so
 * the shaders and the project scene do not pull the whole jungle layout into every chunk; the
 * layout re-exports them. Metres, with the arch at the origin and north along −z.
 */

/** The bowl: the ellipse centred on the arch that everything walkable stands in. */
export const BOWL = { rx: 29.2, rz: 21.4 } as const;

/** Whether (x, z) lies inside the bowl's ellipse. */
export function inBowl(x: number, z: number): boolean {
  return (x / BOWL.rx) ** 2 + (z / BOWL.rz) ** 2 < 1;
}

/** Metres (x, z) lies beyond the bowl's edge, measured along the ray from the arch; negative inside. */
export function beyondBowl(x: number, z: number): number {
  const e = Math.hypot(x / BOWL.rx, z / BOWL.rz);
  return e > 1e-9 ? ((e - 1) * Math.hypot(x, z)) / e : -Math.min(BOWL.rx, BOWL.rz);
}

/** The firefly swarm over the exhibit glade: its centre and its radii. */
export const FIREFLY_GLADE: {
  readonly x: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
} = Object.freeze({ x: 0, z: -11.6, rx: 5, rz: 3 });

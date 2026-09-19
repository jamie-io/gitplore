/** A round basin pressed into a relief: somewhere water can stand. */
export interface Basin {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly depth: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The basin's water line: 20 cm below the lowest ground from 0.9 to 1.3 radii, sampled densely, so
 * the shore is closed all the way round and the water never floats over dry land.
 */
export function basinLevel(relief: (x: number, z: number) => number, basin: Basin): number {
  let lowest = Infinity;
  for (let step = 0; step <= 8; step++) {
    const ring = 0.9 + step * 0.05;
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      lowest = Math.min(
        lowest,
        relief(
          basin.x + Math.sin(angle) * basin.radius * ring,
          basin.z + Math.cos(angle) * basin.radius * ring,
        ),
      );
    }
  }
  return lowest - 0.2;
}

/** `relief` at (x, z) with the basin pressed in: a bowl below `level`, blending out by 1.3 radii. */
export function pressBasin(
  relief: (x: number, z: number) => number,
  basin: Basin,
  level: number,
  x: number,
  z: number,
): number {
  const ground = relief(x, z);
  const distance = Math.hypot(x - basin.x, z - basin.z);
  const inside = 1 - smoothstep(basin.radius * 0.7, basin.radius * 1.3, distance);
  if (inside === 0) {
    return ground;
  }
  const bed = level + basin.depth * ((distance / basin.radius) ** 2 - 1);
  return ground + (bed - ground) * inside;
}

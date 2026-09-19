import {
  BufferGeometry,
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { Random, between, seededRandom } from './random';

/**
 * Ground where a scatter places nothing. Arcs use the `arcAnchors` angle convention — 0 along −Z,
 * growing towards +X — with `-π ≤ from ≤ to ≤ π`.
 */
export type Exclusion =
  | { readonly kind: 'circle'; readonly x: number; readonly z: number; readonly radius: number }
  | {
      readonly kind: 'ring';
      readonly x: number;
      readonly z: number;
      readonly inner: number;
      readonly outer: number;
    }
  | {
      readonly kind: 'arc';
      readonly x: number;
      readonly z: number;
      readonly radius: number;
      readonly halfWidth: number;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: 'segment';
      readonly ax: number;
      readonly az: number;
      readonly bx: number;
      readonly bz: number;
      readonly halfWidth: number;
    };

/** An annulus to scatter over; centred on the origin unless `x`/`z` say otherwise. */
export interface ScatterArea {
  readonly x?: number;
  readonly z?: number;
  readonly inner: number;
  readonly outer: number;
}

export interface ScatterOptions {
  readonly seed: number;
  /** How many to place at most; fewer when the attempts run out. */
  readonly count: number;
  readonly area: ScatterArea;
  /** Uniform scale range, [min, max). */
  readonly scale: readonly [number, number];
  readonly exclusions?: readonly Exclusion[];
  /** Minimum distance between two placements. Quadratic in `count`; keep it for hundreds, not thousands. */
  readonly minSpacing?: number;
  /** Groves: this many centres inside `area`, placements within `radius` of one of them. */
  readonly clusters?: { readonly count: number; readonly radius: number };
  /** Candidates to try before giving up; `count × 30` by default. */
  readonly maxAttempts?: number;
}

/** One thing to stand in the world: where, how big, turned how far, and a 0–1 tint seed. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly tint: number;
}

export interface InstancedOptions {
  readonly name: string;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /** Per-instance colour multiplier from the placement's `tint`; absent means untinted. */
  readonly tint?: (t: number) => Color;
  /** Metres (at scale 1) to sink each instance, so bases never float on slopes. */
  readonly sink?: number;
}

/** Whether (x, z) falls inside any of the exclusions. */
export function isExcluded(x: number, z: number, exclusions: readonly Exclusion[]): boolean {
  return exclusions.some((zone) => {
    switch (zone.kind) {
      case 'circle':
        return Math.hypot(x - zone.x, z - zone.z) < zone.radius;
      case 'ring': {
        const distance = Math.hypot(x - zone.x, z - zone.z);
        return distance >= zone.inner && distance <= zone.outer;
      }
      case 'arc': {
        const distance = Math.hypot(x - zone.x, z - zone.z);
        if (Math.abs(distance - zone.radius) > zone.halfWidth) {
          return false;
        }
        const angle = Math.atan2(x - zone.x, -(z - zone.z));
        return angle >= zone.from && angle <= zone.to;
      }
      case 'segment':
        return distanceToSegment(x, z, zone) < zone.halfWidth;
    }
  });
}

/**
 * Deterministic placements over an annulus, clear of every exclusion.
 *
 * Every candidate consumes the same number of random draws whether it is kept or not, so tuning
 * one exclusion never reshuffles the candidates after it: the rest of the grove stays put.
 */
export function scatter(options: ScatterOptions, ground: HeightField): Placement[] {
  const random = seededRandom(options.seed);
  const exclusions = options.exclusions ?? [];
  const spacing = options.minSpacing ?? 0;
  const attempts = options.maxAttempts ?? options.count * 30;
  const clusters = options.clusters;
  const centres = clusters
    ? Array.from({ length: clusters.count }, () => pointIn(options.area, random))
    : [];
  const placements: Placement[] = [];

  for (let attempt = 0; attempt < attempts && placements.length < options.count; attempt++) {
    const [x, z] = clusters
      ? pointNear(centres, clusters.radius, random)
      : pointIn(options.area, random);
    const scale = between(random, options.scale[0], options.scale[1]);
    const rotation = random() * Math.PI * 2;
    const tint = random();

    if (!inside(options.area, x, z) || isExcluded(x, z, exclusions)) {
      continue;
    }
    if (spacing > 0 && placements.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) {
      continue;
    }

    placements.push({ x, y: ground.heightAt(x, z), z, scale, rotation, tint });
  }

  return placements;
}

/**
 * One `InstancedMesh` for many placements of one geometry: one draw call however many trees stand
 * in the grove.
 */
export function buildInstanced(
  geometry: BufferGeometry,
  material: Material,
  placements: readonly Placement[],
  options: InstancedOptions,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const position = new Vector3();
  const up = new Vector3(0, 1, 0);
  const sink = options.sink ?? 0;

  placements.forEach((placement, index) => {
    rotation.setFromAxisAngle(up, placement.rotation);
    scale.setScalar(placement.scale);
    position.set(placement.x, placement.y - sink * placement.scale, placement.z);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    if (options.tint) {
      mesh.setColorAt(index, options.tint(placement.tint));
    }
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
  mesh.name = options.name;
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? false;
  return mesh;
}

/** A trunk collider per placement, its radius scaled with the placement. */
export function cylinderColliders(placements: readonly Placement[], radius: number): Collider[] {
  return placements.map((p) => ({
    kind: 'cylinder' as const,
    x: p.x,
    z: p.z,
    radius: radius * p.scale,
  }));
}

function pointIn(area: ScatterArea, random: Random): [number, number] {
  // sqrt of a uniform draw over r² spreads points evenly over the annulus, not bunched inside.
  const radius = Math.sqrt(between(random, area.inner ** 2, area.outer ** 2));
  const angle = random() * Math.PI * 2;
  return [(area.x ?? 0) + Math.sin(angle) * radius, (area.z ?? 0) - Math.cos(angle) * radius];
}

function pointNear(
  centres: readonly (readonly [number, number])[],
  radius: number,
  random: Random,
): [number, number] {
  const [cx, cz] = centres[Math.floor(random() * centres.length)];
  const distance = radius * Math.sqrt(random());
  const angle = random() * Math.PI * 2;
  return [cx + Math.sin(angle) * distance, cz - Math.cos(angle) * distance];
}

function inside(area: ScatterArea, x: number, z: number): boolean {
  const distance = Math.hypot(x - (area.x ?? 0), z - (area.z ?? 0));
  return distance >= area.inner && distance <= area.outer;
}

function distanceToSegment(
  x: number,
  z: number,
  segment: { readonly ax: number; readonly az: number; readonly bx: number; readonly bz: number },
): number {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(Math.max(((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSq, 0), 1);
  return Math.hypot(x - (segment.ax + dx * t), z - (segment.az + dz * t));
}

/** Per-instance brightness and warmth drift, so a grove never looks copy-pasted. */
export function foliageTint(t: number): Color {
  return new Color(0.8 + 0.35 * t, 0.85 + 0.25 * t, 0.8 + 0.2 * t);
}

/** Per-instance brightness drift for stone. */
export function stoneTint(t: number): Color {
  const value = 0.85 + 0.3 * t;
  return new Color(value, value, value);
}

/** Splits placements round-robin over a few shape variants: one instanced mesh per variant. */
export function variants(
  build: (seed: number) => BufferGeometry,
  seeds: readonly number[],
  placements: readonly Placement[],
  material: Material,
  options: InstancedOptions,
): InstancedMesh[] {
  return seeds.map((seed, index) =>
    buildInstanced(
      build(seed),
      material,
      placements.filter((_, i) => i % seeds.length === index),
      { ...options, name: `${options.name}-${index}` },
    ),
  );
}

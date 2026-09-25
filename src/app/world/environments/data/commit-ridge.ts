import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { createLabel } from '../../landmarks/base/label';
import type { HeightField } from '@engine/player/collision';
import { assemble, paint } from '../flora';
import { bakeGeometry, borrowModels, mergeBaked } from '../model-geometry';
import type { HazedCopies } from '../shaders/hazed-copies';
import { createPlankSign } from './plank-sign';

/** The sync shape is fixed: one slab per lifetime bucket. */
export const RIDGE_SLAB_COUNT = 52;
const RIDGE_PEAK_COMMITS = 100;

const PATH_INSET = 2;
const BASE_HEIGHT = 0.06;
const MAX_HEIGHT = 2.86;
// Calibrated so a 100-commit bucket reaches the ceiling. The busiest bucket observed so far is
// gitplore's 52, which lands at 2.08 m — 100 is chosen above it so a busier week still reads as
// busier, and every bucket at or over 100 renders flat at MAX_HEIGHT.
// Kept separate from the 52-bucket resolution so a change there does not rescale every ridge.
const SLAB_UNIT = (MAX_HEIGHT - BASE_HEIGHT) / Math.sqrt(RIDGE_PEAK_COMMITS);
const SLAB_DEPTH = 0.9;
/**
 * The Plaza's ridge step (scripts/blender/models/plaza_step.py): a white, bevelled block with its
 * pivot at the bottom centre, stretched to each slab.
 */
export const PLAZA_STEP_MODEL = 'assets/models/plaza-step.glb';
/** The step model's length along the ridge: the Plaza ridge stands one step per this many metres. */
const PLAZA_STEP_MODULE = 0.5;
const SLAB_GAP = 0.3;
const RIDGE_PATH_GAP = 0.5;

/** The ridge's lateral footprint, used by the release cairns to line up beyond it. */
export const RIDGE_HALF_DEPTH = SLAB_DEPTH / 2;
export const RIDGE_OFFSET = RIDGE_HALF_DEPTH + RIDGE_PATH_GAP;

export const JUNGLE_BOARDWALK_PLANK_COUNT = 108;
export const JUNGLE_RAIL_POST_COUNT = 22;
export const JUNGLE_WOOD_COLOURS = [0x6a4a30, 0x5a3d27, 0x70523a, 0x4f3622, 0x634630] as const;

type ToySkin = 'default' | 'jungle' | 'plaza';

export interface CommitRidgeOptions {
  readonly project: Project;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly ground: HeightField;
  readonly skin?: ToySkin;
  readonly reducedMotion?: () => boolean;
  /** Hazes the Plaza's steps into the square's air; the other skins keep their plain material. */
  readonly haze?: HazedCopies;
}

interface RailResources {
  readonly postGeometry: CylinderGeometry;
  readonly postMaterial: MeshStandardMaterial;
  readonly capGeometry: SphereGeometry;
}

/**
 * One merged strip of repository history. Missing data and an all-zero history both stay as a
 * level path; the former is labelled as unavailable and the latter as a quiet lifetime. No slab
 * collides, so the fixed 52-piece layout never changes the player controller's collider count.
 */
export class CommitRidge implements WorldObject {
  readonly id = 'commit-ridge';

  private mesh?: Mesh;
  private label?: Mesh;
  private sign?: Group;
  private rail?: Group;
  private railCaps: Mesh[] = [];
  private railResources?: RailResources;
  private disposed = false;

  constructor(private readonly options: CommitRidgeOptions) {}

  init(ctx: WorldContext): void {
    this.disposed = false;
    const jungle = this.options.skin === 'jungle';
    const geometry = jungle ? buildBoardwalkGeometry(this.options) : buildGeometry(this.options);
    const material = new MeshStandardMaterial({
      color: jungle ? 0xffffff : this.options.project.theme.primary,
      vertexColors: jungle,
      roughness: 0.72,
      metalness: 0.08,
    });
    const mesh = new Mesh(
      geometry,
      // In the Plaza's air, as the square is: hazed on every tier but the lowest.
      this.options.skin === 'plaza' && this.options.haze && ctx.quality.shaderDetail > 0
        ? this.options.haze.own(material)
        : material,
    );
    mesh.name = this.id;
    if (jungle) {
      mesh.userData['plankCount'] = boardwalkPlankCount(this.options.from, this.options.to);
    }
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);
    if (this.options.skin === 'plaza') {
      this.loadSteps(ctx, mesh);
    }

    if (jungle) {
      const rail = buildRail(this.options, this.railCaps);
      this.rail = rail.group;
      this.railResources = rail.resources;
      this.rail.castShadow = ctx.quality.shadows;
      this.rail.receiveShadow = ctx.quality.shadows;
      ctx.scene.add(this.rail);
    }

    if (jungle) {
      const midpoint = offsetPoint(this.options.from, this.options.to, -RIDGE_OFFSET);
      const sign = createPlankSign(
        "Commits im Lebensverlauf · Commits over the project's life",
        this.options.project.theme.primary,
      );
      if (sign) {
        sign.name = 'commit-ridge-sign';
        sign.position.set(
          midpoint.x,
          this.options.ground.heightAt(midpoint.x, midpoint.z),
          midpoint.z,
        );
        sign.rotation.y = facingYaw(this.options.from, this.options.to);
        this.sign = sign;
        ctx.scene.add(sign);
      }
    } else {
      const label = createLabel(
        ridgeLabel(this.options.project),
        this.options.project.theme.primary,
      );
      if (label) {
        const midpoint = offsetPoint(this.options.from, this.options.to, -RIDGE_OFFSET);
        label.name = 'commit-ridge-label';
        label.position.set(
          midpoint.x,
          this.options.ground.heightAt(midpoint.x, midpoint.z) + labelHeight(this.options.project),
          midpoint.z,
        );
        label.rotation.y = facingYaw(this.options.from, this.options.to);
        this.label = label;
        ctx.scene.add(label);
      }
    }
  }

  update(dt: number, ctx: WorldContext): void {
    if (!this.rail) {
      return;
    }

    for (const cap of this.railCaps) {
      const material = cap.material as MeshStandardMaterial;
      const near =
        Math.hypot(ctx.player.position.x - cap.position.x, ctx.player.position.z - cap.position.z) <
        1.5;
      const target = near ? 1.4 : 0;
      material.emissive.setHex(0xe0a13c);
      material.emissiveIntensity = this.options.reducedMotion?.()
        ? target
        : moveTowards(material.emissiveIntensity, target, Math.max(0, dt) * 6);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
    if (this.sign) {
      disposeObject3D(this.sign);
      this.sign = undefined;
    }
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
    if (this.rail) {
      disposeRail(this.rail, this.railCaps, this.railResources);
      this.rail = undefined;
    }
    this.railCaps = [];
    this.railResources = undefined;
  }

  /**
   * Swaps the plain slabs for the Plaza's steps once the model arrives: each slab's box becomes the
   * step stretched to it, white with its ambient occlusion under the project's colour. Without the
   * model the slabs stay.
   */
  private loadSteps(ctx: WorldContext, mesh: Mesh): void {
    borrowModels(
      ctx.assets,
      [PLAZA_STEP_MODEL],
      () => this.disposed,
      (models) => {
        const node = models.get(PLAZA_STEP_MODEL)!.getObjectByName('step');
        const step = node ? bakeGeometry(node) : null;
        if (!step) {
          return;
        }
        mesh.geometry.dispose();
        mesh.geometry = buildStepGeometry(this.options, step);
        step.dispose();
        const material = mesh.material as MeshStandardMaterial;
        material.vertexColors = true;
        material.needsUpdate = true;
      },
    );
  }
}

function buildBoardwalkGeometry(options: CommitRidgeOptions) {
  const { yaw } = pathFrame(options.from, options.to);
  const from = new Vector3(options.from.x, 0, options.from.z);
  const to = new Vector3(options.to.x, 0, options.to.z);
  const plankCount = boardwalkPlankCount(from, to);
  const parts = [];

  for (let index = 0; index < plankCount; index++) {
    const point = from.clone().lerp(to, (index + 0.5) / plankCount);
    const plank = new RoundedBoxGeometry(1.45, 0.07, 0.27, 2, 0.02)
      .rotateY(yaw)
      .translate(point.x, options.ground.heightAt(point.x, point.z) + 0.24, point.z);
    parts.push(paint(plank, JUNGLE_WOOD_COLOURS[index % JUNGLE_WOOD_COLOURS.length]));
  }

  return assemble(parts);
}

function boardwalkPlankCount(from: Vector3, to: Vector3): number {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  return Math.max(1, Math.min(JUNGLE_BOARDWALK_PLANK_COUNT, Math.floor(length / 0.32)));
}

function buildRail(
  options: CommitRidgeOptions,
  caps: Mesh[],
): { group: Group; resources: RailResources } {
  const { side } = pathFrame(options.from, options.to);
  const from = new Vector3(options.from.x, 0, options.from.z);
  const to = new Vector3(options.to.x, 0, options.to.z);
  const group = new Group();
  group.name = 'commit-ridge-rail';
  const postGeometry = new CylinderGeometry(0.06, 0.07, 1, 8);
  const postMaterial = new MeshStandardMaterial({ color: 0x5a3d27, roughness: 0.8 });
  const capGeometry = new SphereGeometry(0.07, 8, 6);
  const buckets = options.project.commitBuckets;
  const maximum = buckets?.reduce(
    (highest, value) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(highest, value) : highest,
    0,
  );

  for (let index = 0; index < JUNGLE_RAIL_POST_COUNT; index++) {
    const point = from
      .clone()
      .lerp(to, index / (JUNGLE_RAIL_POST_COUNT - 1))
      .addScaledVector(side, 0.9);
    const value = railBucketValue(buckets, index);
    const normalised = maximum && maximum > 0 ? value / maximum : 0;
    const height = 0.55 + Math.min(1, normalised) * 0.35;
    const ground = options.ground.heightAt(point.x, point.z);
    const post = new Mesh(postGeometry, postMaterial);
    post.name = `rail-post-${index}`;
    post.scale.y = height;
    post.position.set(point.x, ground + height / 2, point.z);
    group.add(post);

    const cap = new Mesh(
      capGeometry,
      new MeshStandardMaterial({ color: 0x5a3d27, emissive: 0xe0a13c, emissiveIntensity: 0 }),
    );
    cap.name = `rail-cap-${index}`;
    cap.position.set(point.x, ground + height + 0.07, point.z);
    caps.push(cap);
    group.add(cap);
  }

  return { group, resources: { postGeometry, postMaterial, capGeometry } };
}

function disposeRail(group: Group, caps: readonly Mesh[], resources?: RailResources): void {
  group.removeFromParent();
  if (!resources) {
    return;
  }
  resources.postGeometry.dispose();
  resources.postMaterial.dispose();
  resources.capGeometry.dispose();
  caps.forEach((cap) => (cap.material as MeshStandardMaterial).dispose());
}

function moveTowards(current: number, target: number, distance: number): number {
  if (Math.abs(target - current) <= distance) {
    return target;
  }
  return current + Math.sign(target - current) * distance;
}

function railBucketValue(buckets: readonly number[] | undefined, index: number): number {
  if (!buckets || buckets.length === 0) {
    return 0;
  }
  const sourceIndex =
    buckets.length === JUNGLE_RAIL_POST_COUNT
      ? index
      : Math.round((index * (buckets.length - 1)) / (JUNGLE_RAIL_POST_COUNT - 1));
  const value = buckets[sourceIndex];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function pathFrame(
  fromPoint: Vector3,
  toPoint: Vector3,
): {
  side: Vector3;
  yaw: number;
} {
  const axis = new Vector3(toPoint.x - fromPoint.x, 0, toPoint.z - fromPoint.z);
  if (axis.lengthSq() === 0) {
    axis.set(0, 0, -1);
  } else {
    axis.normalize();
  }
  return {
    side: new Vector3(-axis.z, 0, axis.x),
    yaw: Math.atan2(axis.x, axis.z),
  };
}

interface Slab {
  /** Where the slab stands: the centre of its foot, on the ground. */
  readonly foot: Vector3;
  readonly width: number;
  readonly height: number;
  /** Its turn about Y, so its width runs along the ridge. */
  readonly angle: number;
}

/**
 * The ridge's slabs, laid beside the walking line. The default and jungle ridges stand one slab per
 * bucket, 52 of them, inset from both ends. The Plaza's ridge is only a 6 m chord, where 52 slabs
 * came out 8 cm wide and read as spikes: it stands one step per `PLAZA_STEP_MODULE` of the full
 * chord instead, each as high as the commits of the stretch of buckets it covers.
 */
function slabs(options: CommitRidgeOptions): Slab[] {
  return options.skin === 'plaza' ? plazaSteps(options) : bucketSlabs(options);
}

/** The steps of the Plaza ridge: shoulder to shoulder along the whole chord. */
function plazaSteps(options: CommitRidgeOptions): Slab[] {
  const { from, axis, side, angle, distance } = ridgeFrame(options);
  const count = plazaStepCount(options.from, options.to);
  const width = distance / count;
  const heights = resampleBuckets(options.project.commitBuckets, count).map(slabHeight);
  return heights.map((height, index) => {
    const foot = from
      .clone()
      .addScaledVector(axis, (index + 0.5) * width)
      .addScaledVector(side, -RIDGE_OFFSET);
    foot.y = options.ground.heightAt(foot.x, foot.z);
    return { foot, width, height, angle };
  });
}

/** How many steps the Plaza ridge stands along its chord: one per step module, at least one. */
export function plazaStepCount(from: Vector3, to: Vector3): number {
  return Math.max(1, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / PLAZA_STEP_MODULE));
}

/**
 * `buckets` gathered into `groups` consecutive stretches, each the sum of its commits, so a step
 * stands for every commit in its part of the project's life. Missing data stays a level path.
 */
export function resampleBuckets(buckets: readonly number[] | undefined, groups: number): number[] {
  const values = buckets ?? [];
  return Array.from({ length: groups }, (_, group) => {
    const start = Math.floor((group * values.length) / groups);
    const end = Math.floor(((group + 1) * values.length) / groups);
    let sum = 0;
    for (let index = start; index < end; index++) {
      const value = values[index];
      sum += typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    return sum;
  });
}

function ridgeFrame(options: CommitRidgeOptions) {
  const from = new Vector3(options.from.x, 0, options.from.z);
  const to = new Vector3(options.to.x, 0, options.to.z);
  const direction = to.clone().sub(from);
  const distance = direction.length();
  const axis = distance > 0 ? direction.clone().normalize() : new Vector3(0, 0, -1);
  const side = new Vector3(-axis.z, 0, axis.x);
  return { from, axis, side, distance, angle: Math.atan2(-axis.z, axis.x) };
}

/** The 52 slabs of the default and jungle ridges, each as high as its bucket. */
function bucketSlabs(options: CommitRidgeOptions): Slab[] {
  const { from, axis, side, distance, angle } = ridgeFrame(options);
  const inset = Math.min(PATH_INSET, distance / 4);
  const usable = Math.max(distance - inset * 2, 0);
  const width = Math.max(0.08, Math.min(0.65, (usable / RIDGE_SLAB_COUNT) * (1 - SLAB_GAP)));
  const buckets = options.project.commitBuckets;

  return Array.from({ length: RIDGE_SLAB_COUNT }, (_, index) => {
    const foot = from
      .clone()
      .addScaledVector(axis, inset + ((index + 0.5) / RIDGE_SLAB_COUNT) * usable)
      .addScaledVector(side, -RIDGE_OFFSET);
    foot.y = options.ground.heightAt(foot.x, foot.z);
    return { foot, width, height: slabHeight(buckets?.[index]), angle };
  });
}

/**
 * The ridge from the Plaza's step: the model, pivot at its bottom centre, stretched to each slab's
 * width, height and depth, turned and stood on its foot. One geometry, kept in slab order.
 */
function buildStepGeometry(options: CommitRidgeOptions, step: BufferGeometry): BufferGeometry {
  step.computeBoundingBox();
  const size = step.boundingBox!.getSize(new Vector3());
  return mergeBaked(
    slabs(options).map(({ foot, width, height, angle }) =>
      step
        .clone()
        .scale(width / size.x, height / size.y, SLAB_DEPTH / size.z)
        .rotateY(angle)
        .translate(foot.x, foot.y, foot.z),
    ),
  );
}

function buildGeometry(options: CommitRidgeOptions) {
  const parts = slabs(options).map(({ foot, width, height, angle }) =>
    new BoxGeometry(width, height, SLAB_DEPTH)
      .rotateY(angle)
      .translate(foot.x, foot.y + height / 2, foot.z),
  );

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) {
    throw new Error('commit ridge slabs do not share the same attributes');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** How high a slab or step stands for `count` commits: square-root scaled, capped at 2.86 m. */
export function slabHeight(count: number | undefined): number {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0;
  return Math.min(MAX_HEIGHT, BASE_HEIGHT + SLAB_UNIT * Math.sqrt(safeCount));
}

function offsetPoint(from: Vector3, to: Vector3, offset: number): Vector3 {
  const direction = to.clone().sub(from);
  const axis = direction.length() > 0 ? direction.normalize() : new Vector3(0, 0, -1);
  const side = new Vector3(-axis.z, 0, axis.x);
  return from.clone().lerp(to, 0.5).addScaledVector(side, offset);
}

function ridgeLabel(project: Project): string {
  if (project.commitBuckets === undefined) {
    return 'Keine Aktivitätsdaten';
  }
  return project.commitBuckets.some((value) => value > 0)
    ? 'Commits im Lebensverlauf'
    : 'Keine Commits im Zeitraum';
}

function labelHeight(project: Project): number {
  const maximum = project.commitBuckets?.reduce(
    (highest, value) => (Number.isFinite(value) ? Math.max(highest, value) : highest),
    0,
  );
  return 1.3 + (maximum ? MAX_HEIGHT : BASE_HEIGHT);
}

function facingYaw(from: Vector3, to: Vector3): number {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

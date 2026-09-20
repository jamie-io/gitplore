import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { createLabel } from '../../landmarks/base/label';
import type { HeightField } from '@engine/player/collision';

/** The sync shape is fixed: one slab per lifetime bucket. */
export const RIDGE_SLAB_COUNT = 52;

const PATH_INSET = 2;
const BASE_HEIGHT = 0.06;
const MAX_HEIGHT = 2.8;
const SLAB_DEPTH = 0.9;
const SLAB_GAP = 0.3;

export interface CommitRidgeOptions {
  readonly project: Project;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly ground: HeightField;
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

  constructor(private readonly options: CommitRidgeOptions) {}

  init(ctx: WorldContext): void {
    const geometry = buildGeometry(this.options);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: this.options.project.theme.primary,
        roughness: 0.72,
        metalness: 0.08,
      }),
    );
    mesh.name = this.id;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);

    const text = ridgeLabel(this.options.project);
    const label = createLabel(text, this.options.project.theme.primary);
    if (label) {
      const midpoint = this.options.from.clone().lerp(this.options.to, 0.5);
      label.name = 'commit-ridge-label';
      label.position.set(midpoint.x, midpoint.y + labelHeight(this.options.project), midpoint.z);
      label.rotation.y = facingYaw(this.options.from, this.options.to);
      this.label = label;
      ctx.scene.add(label);
    }
  }

  update(): void {
    // The ridge is static repository data.
  }

  dispose(): void {
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}

function buildGeometry(options: CommitRidgeOptions) {
  const from = new Vector3(options.from.x, 0, options.from.z);
  const to = new Vector3(options.to.x, 0, options.to.z);
  const direction = to.clone().sub(from);
  const distance = direction.length();
  const axis = distance > 0 ? direction.clone().normalize() : new Vector3(0, 0, -1);
  const angle = Math.atan2(-axis.z, axis.x);
  const inset = Math.min(PATH_INSET, distance / 4);
  const usable = Math.max(distance - inset * 2, 0);
  const width = Math.max(0.08, Math.min(0.65, (usable / RIDGE_SLAB_COUNT) * (1 - SLAB_GAP)));
  const buckets = options.project.commitBuckets;
  const maximum = buckets?.reduce(
    (highest, value) => (Number.isFinite(value) ? Math.max(highest, value) : highest),
    0,
  );
  const parts = [];

  for (let index = 0; index < RIDGE_SLAB_COUNT; index++) {
    const value = buckets?.[index];
    const share =
      maximum && typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, value) / maximum
        : 0;
    const height = BASE_HEIGHT + share * MAX_HEIGHT;
    const point = from
      .clone()
      .addScaledVector(axis, inset + ((index + 0.5) / RIDGE_SLAB_COUNT) * usable);
    const slab = new BoxGeometry(width, height, SLAB_DEPTH)
      .rotateY(angle)
      .translate(point.x, options.ground.heightAt(point.x, point.z) + height / 2, point.z);
    parts.push(slab);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) {
    throw new Error('commit ridge slabs do not share the same attributes');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
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

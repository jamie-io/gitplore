import { DodecahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { HeightField } from '@engine/player/collision';
import { createLabel } from '../../landmarks/base/label';
import { assemble, paint } from '../flora';
import { RIDGE_HALF_DEPTH, RIDGE_OFFSET } from './commit-ridge';

const MARKER_COLOUR = 0x8c7762;
const RELEASE_PATH_GAP = 0.5;
const CAIRN_SCALES = [0.4, 0.32, 0.24] as const;
const CAIRN_MAX_SCALE = CAIRN_SCALES[0] * 1.16;
const CAIRN_HALF_DEPTH = CAIRN_MAX_SCALE * Math.hypot(1.2, 0.9);

/** Keep release markers beyond the ridge's far edge, with a gap around each footprint. */
export const MARKER_OFFSET = RIDGE_OFFSET + RIDGE_HALF_DEPTH + CAIRN_HALF_DEPTH + RELEASE_PATH_GAP;
export const MAX_RELEASE_MARKERS = 12;
const MAX_RELEASE_LABELS = 3;

export interface ReleaseMarkersOptions {
  readonly project: Project;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly ground: HeightField;
}

/** Release cairns beyond the history ridge; absent release data leaves this object silent. */
export class ReleaseMarkers implements WorldObject {
  readonly id = 'release-markers';

  private mesh?: Mesh;
  private labels: Mesh[] = [];

  constructor(private readonly options: ReleaseMarkersOptions) {}

  init(ctx: WorldContext): void {
    const releases = datedReleases(this.options.project);
    if (releases.length === 0) {
      return;
    }

    const from = new Vector3(this.options.from.x, 0, this.options.from.z);
    const to = new Vector3(this.options.to.x, 0, this.options.to.z);
    const direction = to.clone().sub(from).normalize();
    const side = new Vector3(-direction.z, 0, direction.x);
    const start = Date.parse(this.options.project.createdAt ?? '');
    const end = Date.parse(this.options.project.pushedAt ?? '');
    const span = end - start;
    const parts = [];
    const points: Vector3[] = [];

    for (const [index, release] of releases.entries()) {
      const fraction =
        span > 0
          ? clamp((Date.parse(release.date) - start) / span)
          : evenFraction(index, releases.length);
      const point = from.clone().lerp(to, fraction).addScaledVector(side, -MARKER_OFFSET);
      points.push(point);
      const y = this.options.ground.heightAt(point.x, point.z);
      let stackTop = y;
      for (const scale of CAIRN_SCALES) {
        const stoneScale = scale * (1 + (index % 3) * 0.08);
        const stoneHeight = stoneScale * 1.4;
        parts.push(
          paint(
            new DodecahedronGeometry(stoneScale, 0)
              .scale(1.2, 0.7, 0.9)
              .translate(point.x, stackTop + stoneHeight / 2, point.z),
            MARKER_COLOUR,
          ),
        );
        stackTop += stoneHeight;
      }
    }

    const newest = points[points.length - 1];
    if (newest) {
      const label = createLabel(releaseLabelText(releases), this.options.project.theme.primary);
      if (label) {
        label.name = 'release-marker-label';
        label.position.set(
          newest.x,
          this.options.ground.heightAt(newest.x, newest.z) + 1.25,
          newest.z,
        );
        label.rotation.y = facingYaw(this.options.from, this.options.to);
        this.labels.push(label);
        ctx.scene.add(label);
      }
    }

    const geometry = assemble(parts);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    );
    mesh.name = this.id;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(): void {
    // Release dates are static repository data.
  }

  dispose(): void {
    this.labels.forEach(disposeObject3D);
    this.labels = [];
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}

export function releaseLabelText(releases: NonNullable<Project['releases']>): string {
  return releases
    .slice(-MAX_RELEASE_LABELS)
    .map((release) => `${release.name} · ${releaseDate(release.date)}`)
    .join(' · ');
}

function datedReleases(project: Project) {
  return [...(project.releases ?? [])]
    .filter((release) => Number.isFinite(Date.parse(release.date)))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
    .slice(-MAX_RELEASE_MARKERS);
}

function releaseDate(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function evenFraction(index: number, count: number): number {
  return count === 1 ? 0.5 : index / (count - 1);
}

function facingYaw(from: Vector3, to: Vector3): number {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

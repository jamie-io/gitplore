import {
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { HeightField } from '@engine/player/collision';
import { createLabel } from '../../landmarks/base/label';
import { assemble, paint } from '../flora';
import { RIDGE_HALF_DEPTH, RIDGE_OFFSET } from './commit-ridge';
import { createPlankSign } from './plank-sign';

const MARKER_COLOUR = 0x8c7762;
export const JUNGLE_MOSS_COLOUR = 0x5f7f3a;
const RELEASE_PATH_GAP = 0.5;
const CAIRN_SCALES = [0.4, 0.32, 0.24] as const;
const CAIRN_MAX_SCALE = CAIRN_SCALES[0] * 1.16;
const CAIRN_HALF_DEPTH = CAIRN_MAX_SCALE * Math.hypot(1.2, 0.9);

/** Keep release markers beyond the ridge's far edge, with a gap around each footprint. */
export const MARKER_OFFSET = RIDGE_OFFSET + RIDGE_HALF_DEPTH + CAIRN_HALF_DEPTH + RELEASE_PATH_GAP;
export const MAX_RELEASE_MARKERS = 12;
const MAX_RELEASE_LABELS = 3;

type ToySkin = 'default' | 'jungle';

export interface ReleaseMarkersOptions {
  readonly project: Project;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly ground: HeightField;
  readonly skin?: ToySkin;
}

/** Release cairns beyond the history ridge; absent release data leaves this object silent. */
export class ReleaseMarkers implements WorldObject {
  readonly id = 'release-markers';

  private mesh?: Mesh;
  private labels: Mesh[] = [];
  private versionLabels: Mesh[] = [];
  private sign?: Group;

  constructor(private readonly options: ReleaseMarkersOptions) {}

  init(ctx: WorldContext): void {
    const releases = datedReleases(this.options.project);
    if (releases.length === 0) {
      return;
    }

    const jungle = this.options.skin === 'jungle';
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
      let topStoneScale: number = CAIRN_SCALES[CAIRN_SCALES.length - 1];
      let topStoneCentreY = stackTop;
      for (const [stoneIndex, scale] of CAIRN_SCALES.entries()) {
        const stoneScale = scale * (1 + (index % 3) * 0.08);
        const stoneHeight = stoneScale * 1.4;
        if (stoneIndex === CAIRN_SCALES.length - 1) {
          topStoneScale = stoneScale;
          topStoneCentreY = stackTop + stoneHeight / 2;
        }
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
      if (jungle) {
        const capScale = CAIRN_MAX_SCALE * (1 + (index % 3) * 0.05);
        parts.push(
          paint(
            new IcosahedronGeometry(capScale, 0)
              .scale(1.1, 0.22, 0.85)
              .translate(point.x, stackTop + 0.035, point.z),
            JUNGLE_MOSS_COLOUR,
          ),
        );
        const version = createLabel(release.name, '#f4e6c8');
        if (version) {
          version.name = `release-marker-version-${index}`;
          version.geometry.computeBoundingBox();
          const labelHeight = version.geometry.boundingBox
            ? version.geometry.boundingBox.max.y - version.geometry.boundingBox.min.y
            : 0.6;
          version.scale.setScalar(0.12 / labelHeight);
          const faceOffset = topStoneScale * Math.hypot(side.x * 1.2, side.z * 0.9) + 0.01;
          version.position.set(
            point.x + side.x * faceOffset,
            topStoneCentreY,
            point.z + side.z * faceOffset,
          );
          version.rotation.y = Math.atan2(side.x, side.z);
          this.versionLabels.push(version);
        }
      }
    }

    const newest = points[points.length - 1];
    if (newest) {
      if (jungle) {
        const sign = createPlankSign('Releases · Versions', this.options.project.theme.primary);
        if (sign) {
          sign.name = 'release-marker-sign';
          sign.position.set(newest.x, this.options.ground.heightAt(newest.x, newest.z), newest.z);
          sign.rotation.y = facingYaw(this.options.from, this.options.to);
          this.sign = sign;
          ctx.scene.add(sign);
        }
      } else {
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
    }

    const geometry = assemble(parts);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    );
    mesh.name = this.id;
    mesh.userData['cairnCount'] = releases.length;
    mesh.add(...this.versionLabels);
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
    if (this.sign) {
      disposeObject3D(this.sign);
      this.sign = undefined;
    }
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
    this.versionLabels = [];
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

import { DodecahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { HeightField } from '@engine/player/collision';
import { createLabel } from '../../landmarks/base/label';
import { assemble, paint } from '../flora';

const MARKER_OFFSET = 1.7;
const MARKER_COLOUR = 0x8c7762;

export interface ReleaseMarkersOptions {
  readonly project: Project;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly ground: HeightField;
}

/** Release cairns beside the history path; absent releases get a German empty-state label. */
export class ReleaseMarkers implements WorldObject {
  readonly id = 'release-markers';

  private mesh?: Mesh;
  private labels: Mesh[] = [];

  constructor(private readonly options: ReleaseMarkersOptions) {}

  init(ctx: WorldContext): void {
    const releases = datedReleases(this.options.project);
    if (releases.length === 0) {
      this.addEmptyLabel(
        ctx,
        this.options.project.releases === undefined
          ? 'Keine Veröffentlichungsdaten'
          : 'Keine Veröffentlichungen',
      );
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

    for (const [index, release] of releases.entries()) {
      const fraction = span > 0 ? clamp((Date.parse(release.date) - start) / span) : 0.5;
      const point = from.clone().lerp(to, fraction).addScaledVector(side, MARKER_OFFSET);
      const y = this.options.ground.heightAt(point.x, point.z);
      for (const [layer, scale] of [0.24, 0.32, 0.4].entries()) {
        parts.push(
          paint(
            new DodecahedronGeometry(scale * (1 + ((index + layer) % 3) * 0.08), 0)
              .scale(1.2, 0.7, 0.9)
              .translate(point.x, y + scale * (layer + 0.5), point.z),
            MARKER_COLOUR,
          ),
        );
      }

      const label = createLabel(
        `${release.name} · ${releaseDate(release.date)}`,
        this.options.project.theme.primary,
      );
      if (label) {
        label.name = `release-marker-label-${index}`;
        label.position.set(point.x, y + 1.25, point.z);
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

  private addEmptyLabel(ctx: WorldContext, text: string): void {
    const midpoint = this.options.from.clone().lerp(this.options.to, 0.5);
    const label = createLabel(text, this.options.project.theme.primary);
    if (!label) {
      return;
    }
    label.name = 'release-markers-label';
    label.position.set(midpoint.x, midpoint.y + 1.2, midpoint.z);
    label.rotation.y = facingYaw(this.options.from, this.options.to);
    this.labels.push(label);
    ctx.scene.add(label);
  }
}

function datedReleases(project: Project) {
  return (project.releases ?? []).filter((release) => Number.isFinite(Date.parse(release.date)));
}

function releaseDate(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function facingYaw(from: Vector3, to: Vector3): number {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

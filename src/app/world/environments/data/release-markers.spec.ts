import { Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { MARKER_OFFSET, ReleaseMarkers } from './release-markers';

const PROJECT = PROJECT_FIXTURES[0];
const options = (project: Project) => ({
  project,
  from: new Vector3(0, 0, 15),
  to: new Vector3(0, 0, -17),
  ground: { heightAt: () => 0 },
});

describe('ReleaseMarkers', () => {
  it('stacks the largest cairn stone at the bottom', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      createdAt: '2025-01-01T00:00:00Z',
      pushedAt: '2026-01-01T00:00:00Z',
      releases: [{ name: 'v1.0.0', date: '2025-06-01T00:00:00Z' }],
    };

    const markers = new ReleaseMarkers(options(project));
    markers.init(ctx);
    const mesh = ctx.scene.getObjectByName('release-markers') as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    const bottomRadii: number[] = [];
    const topRadii: number[] = [];

    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      const radius = Math.hypot(positions.getX(index) + MARKER_OFFSET, positions.getZ(index) + 1);
      if (y < 0.4) {
        bottomRadii.push(radius);
      }
      if (y > 1) {
        topRadii.push(radius);
      }
    }

    expect(Math.max(...bottomRadii)).toBeGreaterThan(Math.max(...topRadii));

    markers.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('spreads undated releases along the walk', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      releases: [
        { name: 'v1.0.0', date: '2025-06-01T00:00:00Z' },
        { name: 'v2.0.0', date: '2025-12-01T00:00:00Z' },
        { name: 'v3.0.0', date: '2026-06-01T00:00:00Z' },
      ],
    };

    const markers = new ReleaseMarkers(options(project));
    markers.init(ctx);
    const mesh = ctx.scene.getObjectByName('release-markers') as Mesh;

    expect(mesh.geometry.boundingBox?.max.z).toBeGreaterThan(10);
    expect(mesh.geometry.boundingBox?.min.z).toBeLessThan(-10);

    markers.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('uses one sign for the newest releases', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      createdAt: '2025-01-01T00:00:00Z',
      pushedAt: '2026-01-01T00:00:00Z',
      releases: Array.from({ length: 20 }, (_, index) => ({
        name: `v${index + 1}.0.0`,
        date: `2025-${String((index % 12) + 1).padStart(2, '0')}-01T00:00:00Z`,
      })),
    };

    const markers = new ReleaseMarkers(options(project));
    markers.init(ctx);
    const mesh = ctx.scene.getObjectByName('release-markers') as Mesh;

    const cappedContext = stubContext();
    const capped = new ReleaseMarkers(
      options({ ...project, releases: project.releases?.slice(0, 12) }),
    );
    capped.init(cappedContext);
    const cappedMesh = cappedContext.scene.getObjectByName('release-markers') as Mesh;

    expect(mesh.geometry.getAttribute('position').count).toBe(
      cappedMesh.geometry.getAttribute('position').count,
    );

    markers.dispose();
    capped.dispose();
    expect(ctx.scene.children).toHaveLength(0);
    expect(cappedContext.scene.children).toHaveLength(0);
  });

  it('places a merged cairn beside the walk for each dated release', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      createdAt: '2025-01-01T00:00:00Z',
      pushedAt: '2026-01-01T00:00:00Z',
      releases: [
        { name: 'v1.0.0', date: '2025-06-01T00:00:00Z' },
        { name: 'v2.0.0', date: '2025-12-01T00:00:00Z' },
      ],
    };

    const markers = new ReleaseMarkers(options(project));
    markers.init(ctx);
    const mesh = ctx.scene.getObjectByName('release-markers');

    expect(mesh).toBeInstanceOf(Mesh);
    expect((mesh as Mesh).geometry.getAttribute('position').count).toBeGreaterThan(2 * 8);
    markers.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('leaves the path without markers when release data is absent or empty', () => {
    for (const project of [PROJECT, { ...PROJECT, releases: [] }]) {
      const ctx = stubContext();

      const markers = new ReleaseMarkers(options(project));
      markers.init(ctx);

      expect(ctx.scene.getObjectByName('release-markers')).toBeUndefined();
      markers.dispose();
      expect(ctx.scene.children).toHaveLength(0);
    }
  });
});

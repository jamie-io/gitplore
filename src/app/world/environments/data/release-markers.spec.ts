import { Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { ReleaseMarkers } from './release-markers';

const PROJECT = PROJECT_FIXTURES[0];
const options = (project: Project) => ({
  project,
  from: new Vector3(0, 0, 15),
  to: new Vector3(0, 0, -17),
  ground: { heightAt: () => 0 },
});

describe('ReleaseMarkers', () => {
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

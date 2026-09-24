import { Color, Group, Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import {
  JUNGLE_MOSS_COLOUR,
  MARKER_OFFSET,
  ReleaseMarkers,
  releaseLabelText,
} from './release-markers';

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

  it('labels exactly the newest three releases in chronological order', () => {
    const releases = [
      { name: 'v1.0.0', date: '2025-01-01T00:00:00Z' },
      { name: 'v2.0.0', date: '2025-02-01T00:00:00Z' },
      { name: 'v3.0.0', date: '2025-03-01T00:00:00Z' },
      { name: 'v4.0.0', date: '2025-04-01T00:00:00Z' },
      { name: 'v5.0.0', date: '2025-05-01T00:00:00Z' },
      { name: 'v6.0.0', date: '2025-06-01T00:00:00Z' },
    ];

    expect(releaseLabelText(releases).match(/v\d+\.0\.0/g)).toEqual(['v4.0.0', 'v5.0.0', 'v6.0.0']);
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

  it('builds jungle cairns with moss caps and version labels', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      releases: [
        { name: 'v1.0.0', date: '2025-06-01T00:00:00Z' },
        { name: 'v2.0.0', date: '2025-12-01T00:00:00Z' },
      ],
    };
    const markers = new ReleaseMarkers({ ...options(project), skin: 'jungle' });
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    markers.init(ctx);

    const mesh = ctx.scene.getObjectByName('release-markers') as Mesh;
    expect(mesh.userData['cairnCount']).toBe(2);
    const colours = mesh.geometry.getAttribute('color');
    const moss = new Color(JUNGLE_MOSS_COLOUR);
    expect(
      Array.from({ length: colours.count }, (_, index) =>
        [colours.getX(index), colours.getY(index), colours.getZ(index)].every(
          (component, axis) => Math.abs(component - [moss.r, moss.g, moss.b][axis]) < 0.00001,
        ),
      ).some(Boolean),
    ).toBe(true);
    expect(ctx.scene.getObjectByName('release-marker-version-0')).toBeDefined();
    expect(ctx.scene.getObjectByName('release-marker-version-1')).toBeDefined();
    const version = ctx.scene.getObjectByName('release-marker-version-0') as Mesh;
    expect(version.parent).toBe(mesh);
    expect(version.scale.x).toBeCloseTo(0.2, 5);
    expect(version.scale.x).toBe(version.scale.y);
    expect(version.position.y).toBeLessThan(1.4);
    expect(ctx.scene.getObjectByName('release-marker-sign')).toBeInstanceOf(Group);

    markers.dispose();
    canvasContext.mockRestore();
    expect(ctx.scene.children).toHaveLength(0);
  });
});

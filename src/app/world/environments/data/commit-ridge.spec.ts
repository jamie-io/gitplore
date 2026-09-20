import { Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { CommitRidge } from './commit-ridge';

const PROJECT = PROJECT_FIXTURES[0];
const FROM = new Vector3(0, 0, 15);
const TO = new Vector3(0, 0, -17);
const ground = { heightAt: () => 0 };

function meshFor(project: Project): {
  ctx: ReturnType<typeof stubContext>;
  mesh: Mesh;
  ridge: CommitRidge;
} {
  const ctx = stubContext();
  const ridge = new CommitRidge({ project, from: FROM, to: TO, ground });
  ridge.init(ctx);
  const mesh = ctx.scene.getObjectByName('commit-ridge');
  expect(mesh).toBeInstanceOf(Mesh);
  return { ctx, mesh: mesh as Mesh, ridge };
}

describe('CommitRidge', () => {
  it('merges all 52 slabs into one mesh and scales height from activity', () => {
    const project: Project = {
      ...PROJECT,
      commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 25 ? 7 : 0)),
    };
    const { ctx, mesh, ridge } = meshFor(project);

    expect(ctx.scene.children.filter((child) => child.name === 'commit-ridge')).toHaveLength(1);
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(52 * 8);
    expect(mesh.geometry.boundingBox?.max.y).toBeGreaterThan(1);

    ridge.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('shows a flat path when commit data is absent or empty', () => {
    for (const project of [PROJECT, { ...PROJECT, commitBuckets: Array(52).fill(0) }]) {
      const { ctx, mesh, ridge } = meshFor(project);
      const bounds = mesh.geometry.boundingBox;

      expect(bounds).toBeDefined();
      expect((bounds?.max.y ?? 0) - (bounds?.min.y ?? 0)).toBeLessThan(0.2);
      ridge.dispose();
      expect(ctx.scene.children).toHaveLength(0);
    }
  });

  it('builds the same slab layout for the same repository data', () => {
    const project: Project = {
      ...PROJECT,
      commitBuckets: Array.from({ length: 52 }, (_, index) => index % 4),
    };
    const first = meshFor(project);
    const second = meshFor(project);

    expect(Array.from(first.mesh.geometry.getAttribute('position').array)).toEqual(
      Array.from(second.mesh.geometry.getAttribute('position').array),
    );

    first.ridge.dispose();
    second.ridge.dispose();
    expect(first.ctx.scene.children).toHaveLength(0);
    expect(second.ctx.scene.children).toHaveLength(0);
  });
});

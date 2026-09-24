import { Color, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import {
  CommitRidge,
  JUNGLE_BOARDWALK_PLANK_COUNT,
  JUNGLE_RAIL_POST_COUNT,
  JUNGLE_WOOD_COLOURS,
  RIDGE_SLAB_COUNT,
} from './commit-ridge';

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

function slabHeight(mesh: Mesh, index: number): number {
  const positions = mesh.geometry.getAttribute('position');
  const verticesPerSlab = positions.count / RIDGE_SLAB_COUNT;
  expect(Number.isInteger(verticesPerSlab)).toBe(true);

  let minimum = Infinity;
  let maximum = -Infinity;
  for (let vertex = index * verticesPerSlab; vertex < (index + 1) * verticesPerSlab; vertex++) {
    const y = positions.getY(vertex);
    minimum = Math.min(minimum, y);
    maximum = Math.max(maximum, y);
  }
  return maximum - minimum;
}

describe('CommitRidge', () => {
  it('keeps the ridge beside the walking line', () => {
    const { ctx, mesh, ridge } = meshFor({
      ...PROJECT,
      commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 25 ? 7 : 0)),
    });

    expect(mesh.geometry.boundingBox?.max.x).toBeLessThan(0);

    ridge.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('merges all 52 slabs into one mesh and scales height from activity', () => {
    const project: Project = {
      ...PROJECT,
      commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 25 ? 7 : 0)),
    };
    const { ctx, mesh, ridge } = meshFor(project);

    expect(ctx.scene.children.filter((child) => child.name === 'commit-ridge')).toHaveLength(1);
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(52 * 8);
    expect(mesh.geometry.boundingBox?.max.y).toBeCloseTo(0.80081, 5);

    ridge.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('keeps slab heights absolute across repositories with different maxima', () => {
    const seven = meshFor({
      ...PROJECT,
      commitBuckets: Array.from({ length: RIDGE_SLAB_COUNT }, (_, index) => (index === 25 ? 7 : 0)),
    });
    const sevenWithHigherMaximum = meshFor({
      ...PROJECT,
      commitBuckets: Array.from({ length: RIDGE_SLAB_COUNT }, (_, index) =>
        index === 0 ? 100 : index === 25 ? 7 : 0,
      ),
    });

    const sevenHeight = slabHeight(seven.mesh, 25);
    const sevenWithHigherMaximumHeight = slabHeight(sevenWithHigherMaximum.mesh, 25);
    const peakHeight = slabHeight(sevenWithHigherMaximum.mesh, 0);

    expect(sevenHeight).toBeCloseTo(0.80081, 5);
    expect(sevenWithHigherMaximumHeight).toBeCloseTo(0.80081, 5);
    expect(peakHeight).toBeCloseTo(2.86, 5);
    expect(sevenHeight).toBe(sevenWithHigherMaximumHeight);

    seven.ridge.dispose();
    sevenWithHigherMaximum.ridge.dispose();
    expect(seven.ctx.scene.children).toHaveLength(0);
    expect(sevenWithHigherMaximum.ctx.scene.children).toHaveLength(0);
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

  it('builds the jungle boardwalk with coloured planks and normalised rail heights', () => {
    const project: Project = {
      ...PROJECT,
      commitBuckets: [1, 2, ...Array(20).fill(0)],
    };
    const ctx = stubContext();
    const reducedMotion = { value: false };
    const ridge = new CommitRidge({
      project,
      from: FROM,
      to: TO,
      ground,
      skin: 'jungle',
      reducedMotion: () => reducedMotion.value,
    });

    ridge.init(ctx);

    const boardwalk = ctx.scene.getObjectByName('commit-ridge') as Mesh;
    const rail = ctx.scene.getObjectByName('commit-ridge-rail');
    expect(boardwalk.userData['plankCount']).toBe(Math.floor(FROM.distanceTo(TO) / 0.32));
    expect(boardwalk.geometry.getAttribute('position').count).toBeGreaterThan(
      JUNGLE_BOARDWALK_PLANK_COUNT * 8,
    );
    const colours = boardwalk.geometry.getAttribute('color');
    expect(
      JUNGLE_WOOD_COLOURS.every((colour) => {
        const expected = new Color(colour);
        return Array.from({ length: colours.count }, (_, index) =>
          [colours.getX(index), colours.getY(index), colours.getZ(index)].every(
            (component, axis) =>
              Math.abs(component - [expected.r, expected.g, expected.b][axis]) < 0.00001,
          ),
        ).some(Boolean);
      }),
    ).toBe(true);
    expect(rail).toBeInstanceOf(Group);
    const posts = (rail as Group).children.filter((child) => child.name.startsWith('rail-post-'));
    expect(posts).toHaveLength(JUNGLE_RAIL_POST_COUNT);
    expect((posts[0] as Mesh).scale.y).toBeCloseTo(0.725, 5);
    expect((posts[1] as Mesh).scale.y).toBeCloseTo(0.9, 5);
    expect((posts[0] as Mesh).geometry).toBe((posts[1] as Mesh).geometry);
    expect((posts[0] as Mesh).material).toBe((posts[1] as Mesh).material);

    const caps = (rail as Group).children.filter((child) => child.name.startsWith('rail-cap-'));
    const capMaterial = (caps[0] as Mesh).material as MeshStandardMaterial;
    expect((caps[0] as Mesh).geometry).toBe((caps[1] as Mesh).geometry);
    expect((caps[0] as Mesh).material).not.toBe((caps[1] as Mesh).material);
    ctx.player.position.set((caps[0] as Mesh).position.x, 0, (caps[0] as Mesh).position.z);
    ridge.update(0.1, ctx);
    expect(capMaterial.emissive.getHex()).toBe(0xe0a13c);
    expect(capMaterial.emissiveIntensity).toBeCloseTo(0.6, 5);
    ridge.update(0.1, ctx);
    expect(capMaterial.emissiveIntensity).toBeCloseTo(1.2, 5);
    ctx.player.position.set(100, 0, 100);
    ridge.update(0.1, ctx);
    expect(capMaterial.emissiveIntensity).toBeCloseTo(0.6, 5);
    reducedMotion.value = true;
    ridge.update(0.1, ctx);
    expect(capMaterial.emissiveIntensity).toBe(0);

    const postGeometry = (posts[0] as Mesh).geometry;
    const postMaterial = (posts[0] as Mesh).material as MeshStandardMaterial;
    const capGeometry = (caps[0] as Mesh).geometry;
    const postGeometryDispose = vi.spyOn(postGeometry, 'dispose');
    const postMaterialDispose = vi.spyOn(postMaterial, 'dispose');
    const capGeometryDispose = vi.spyOn(capGeometry, 'dispose');

    ridge.dispose();
    expect(postGeometryDispose).toHaveBeenCalledTimes(1);
    expect(postMaterialDispose).toHaveBeenCalledTimes(1);
    expect(capGeometryDispose).toHaveBeenCalledTimes(1);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('caps jungle plank count at 108 for long walks', () => {
    const ctx = stubContext();
    const ridge = new CommitRidge({
      project: { ...PROJECT, commitBuckets: [] },
      from: new Vector3(0, 0, 100),
      to: new Vector3(0, 0, -100),
      ground,
      skin: 'jungle',
    });

    ridge.init(ctx);

    expect((ctx.scene.getObjectByName('commit-ridge') as Mesh).userData['plankCount']).toBe(
      JUNGLE_BOARDWALK_PLANK_COUNT,
    );
    ridge.dispose();
  });
});

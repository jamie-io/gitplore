import { readFileSync } from 'node:fs';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { stubContext } from '@engine/testing/world-context';
import { LICHTUNG, PLAZA } from '../mood';
import { HazedCopies } from '../shaders/hazed-copies';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { bakeGeometry } from '../model-geometry';
import { ModelFiles, loadModelFile } from '../testing/model-files';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import {
  JUNGLE_BAMBOO_COLOUR,
  JUNGLE_BAMBOO_NODE_COLOUR,
  LANGUAGE_COLOURS,
  LanguagePillars,
  PLAZA_PILLAR_MODEL,
} from './language-pillars';

const PROJECT = PROJECT_FIXTURES[0];
const options = (project: Project, skin?: 'jungle') => ({
  project,
  origin: new Vector3(0, 0, -12),
  rotationY: 0,
  ground: { heightAt: () => 0 },
  skin,
});

describe('LanguagePillars', () => {
  it('caps long language rows at the same geometry as the capped count', () => {
    const languages = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `Language ${index.toString().padStart(2, '0')}`,
        1,
      ]),
    );
    const manyContext = stubContext();
    const many = new LanguagePillars(options({ ...PROJECT, languages }));
    many.init(manyContext);
    const manyMesh = manyContext.scene.getObjectByName('language-pillars') as Mesh;

    const cappedContext = stubContext();
    const capped = new LanguagePillars(
      options({
        ...PROJECT,
        languages: Object.fromEntries(Object.entries(languages).slice(0, 12)),
      }),
    );
    capped.init(cappedContext);
    const cappedMesh = cappedContext.scene.getObjectByName('language-pillars') as Mesh;

    expect(manyMesh.geometry.getAttribute('position').count).toBe(
      cappedMesh.geometry.getAttribute('position').count,
    );

    many.dispose();
    capped.dispose();
    expect(manyContext.scene.children).toHaveLength(0);
    expect(cappedContext.scene.children).toHaveLength(0);
  });

  it('keeps a later high-byte language when the cap removes earlier names', () => {
    const languages = Object.fromEntries([
      ['Aardvark', 1],
      ...Array.from({ length: 11 }, (_, index) => [
        `Language ${index.toString().padStart(2, '0')}`,
        1,
      ]),
      ['TypeScript', 1000],
    ]);
    const ctx = stubContext();
    const pillars = new LanguagePillars(options({ ...PROJECT, languages }));

    pillars.init(ctx);

    const mesh = ctx.scene.getObjectByName('language-pillars') as Mesh;
    mesh.geometry.computeBoundingBox();
    const typescript = new Color(LANGUAGE_COLOURS['TypeScript']);
    const colours = mesh.geometry.getAttribute('color');
    const hasTypescriptColour = Array.from({ length: colours.count }, (_, index) =>
      [colours.getX(index), colours.getY(index), colours.getZ(index)].every(
        (component, axis) =>
          Math.abs(component - [typescript.r, typescript.g, typescript.b][axis]) < 0.00001,
      ),
    ).some(Boolean);

    expect(mesh.geometry.boundingBox?.max.y).toBeGreaterThan(3);
    expect(hasTypescriptColour).toBe(true);

    pillars.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('builds one coloured pillar for each language', () => {
    const ctx = stubContext();
    const project: Project = {
      ...PROJECT,
      languages: { TypeScript: 900, HTML: 100 },
    };

    const pillars = new LanguagePillars(options(project));
    pillars.init(ctx);
    const mesh = ctx.scene.getObjectByName('language-pillars');

    expect(mesh).toBeInstanceOf(Mesh);
    expect((mesh as Mesh).geometry.getAttribute('position').count).toBeGreaterThan(2 * 8);
    expect((mesh as Mesh).geometry.getAttribute('color')).toBeDefined();

    pillars.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('builds no pillars when language data is absent or empty', () => {
    for (const project of [PROJECT, { ...PROJECT, languages: {} }]) {
      const ctx = stubContext();

      const pillars = new LanguagePillars(options(project));
      pillars.init(ctx);

      expect(ctx.scene.getObjectByName('language-pillars')).toBeUndefined();
      pillars.dispose();
      expect(ctx.scene.children).toHaveLength(0);
    }
  });

  it('builds jungle bamboo at language-share heights with coloured bands', () => {
    const ctx = stubContext();
    const pillars = new LanguagePillars(
      options({ ...PROJECT, languages: { TypeScript: 3, HTML: 1 } }, 'jungle'),
    );
    pillars.init(ctx);

    const mesh = ctx.scene.getObjectByName('language-pillars') as Mesh;
    mesh.geometry.computeBoundingBox();
    expect(mesh.userData['stalkCount']).toBe(2);
    expect(mesh.userData['nodeCount']).toBe(14);
    expect(mesh.userData['stalkHeights']).toEqual([4.1, 2.3]);
    expect(mesh.geometry.boundingBox?.max.y).toBeGreaterThan(4);
    const colours = mesh.geometry.getAttribute('color');
    const bamboo = new Color(JUNGLE_BAMBOO_COLOUR);
    const node = new Color(JUNGLE_BAMBOO_NODE_COLOUR);
    const hasBamboo = Array.from({ length: colours.count }, (_, index) =>
      [colours.getX(index), colours.getY(index), colours.getZ(index)].every(
        (component, axis) => Math.abs(component - [bamboo.r, bamboo.g, bamboo.b][axis]) < 0.00001,
      ),
    ).some(Boolean);
    expect(hasBamboo).toBe(true);
    expect(
      Array.from({ length: colours.count }, (_, index) =>
        [colours.getX(index), colours.getY(index), colours.getZ(index)].every(
          (component, axis) => Math.abs(component - [node.r, node.g, node.b][axis]) < 0.00001,
        ),
      ).some(Boolean),
    ).toBe(true);

    pillars.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('draws the jungle bamboo through the atmosphere, as the release cairns are', () => {
    const ctx = stubContext();
    const haze = new HazedCopies(new SharedUniforms(LICHTUNG));
    const project: Project = { ...PROJECT, languages: { TypeScript: 1 } };
    const pillars = new LanguagePillars({ ...options(project, 'jungle'), haze });
    pillars.init(ctx);

    const mesh = ctx.scene.getObjectByName('language-pillars') as Mesh;
    expect((mesh.material as MeshStandardMaterial).customProgramCacheKey()).toContain('atmosphere');
    pillars.dispose();
  });

  it('builds the Plaza row from the column model, each column as high as its pillar', async () => {
    const project: Project = { ...PROJECT, languages: { TypeScript: 700, JavaScript: 300 } };
    const plainContext = stubContext();
    const plain = new LanguagePillars(options(project));
    plain.init(plainContext);
    const assets = new ModelFiles((path) => readFileSync(path));
    const ctx = stubContext(assets);
    const haze = new HazedCopies(new SharedUniforms(PLAZA));
    const pillars = new LanguagePillars({ ...options(project), skin: 'plaza', haze });

    pillars.init(ctx);
    expect(assets.requested).toEqual([PLAZA_PILLAR_MODEL]);
    await assets.settled();

    const mesh = ctx.scene.getObjectByName('language-pillars') as Mesh;
    const plainMesh = plainContext.scene.getObjectByName('language-pillars') as Mesh;
    expect(mesh.geometry.getAttribute('position').count).not.toBe(
      plainMesh.geometry.getAttribute('position').count,
    );
    // Each column tops out where its plain pillar did: the highest point beside each spot.
    const tops = (target: Mesh) => {
      const position = target.geometry.getAttribute('position');
      const top = new Map<number, number>();
      for (let i = 0; i < position.count; i++) {
        const spot = Math.round(position.getX(i) / 1.2);
        top.set(spot, Math.max(top.get(spot) ?? 0, position.getY(i)));
      }
      return [...top.entries()].sort(([a], [b]) => a - b).map(([, y]) => y);
    };
    const expected = tops(plainMesh);
    tops(mesh).forEach((top, index) => expect(top).toBeCloseTo(expected[index], 3));
    // The shafts wear their language's colour, somewhere on the TypeScript column.
    const colour = mesh.geometry.getAttribute('color');
    const typescript = new Color(LANGUAGE_COLOURS['TypeScript']);
    let tinted = false;
    for (let i = 0; i < colour.count && !tinted; i++) {
      const [r, g, b] = [colour.getX(i), colour.getY(i), colour.getZ(i)];
      tinted =
        r > 0 &&
        Math.abs(g / r - typescript.g / typescript.r) < 0.02 &&
        Math.abs(b / r - typescript.b / typescript.r) < 0.02;
    }
    expect(tinted).toBe(true);
    expect((mesh.material as MeshStandardMaterial).customProgramCacheKey()).toContain('atmosphere');
    expect(new Box3().setFromObject(mesh).min.y).toBeCloseTo(0, 3);

    pillars.dispose();
    plain.dispose();
    expect(assets.releasedModels).toEqual([PLAZA_PILLAR_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('keeps a short column’s shaft in view and turns every column square to the row', async () => {
    const project: Project = { ...PROJECT, languages: { TypeScript: 1000, Tiny: 1 } };
    const read = (path: string) => readFileSync(path);
    const assets = new ModelFiles(read);
    const ctx = stubContext(assets);
    const rotationY = Math.PI / 4;
    const pillars = new LanguagePillars({
      ...options(project),
      origin: new Vector3(0, 0, 0),
      rotationY,
      skin: 'plaza',
    });
    pillars.init(ctx);
    await assets.settled();

    const model = await loadModelFile(read, `public/${PLAZA_PILLAR_MODEL}`);
    const [base, shaft, capital] = ['base', 'shaft', 'capital'].map(
      (name) => bakeGeometry(model.getObjectByName(name)!)!.getAttribute('position').count,
    );
    const position = (ctx.scene.getObjectByName('language-pillars') as Mesh).geometry.getAttribute(
      'position',
    );
    expect(position.count).toBe(2 * (base + shaft + capital));
    // The second column, Tiny: the shortest pillar there is.
    const first = base + shaft + capital;
    const span = (from: number, count: number, read: (i: number) => number) => {
      let [low, high] = [Infinity, -Infinity];
      for (let i = from; i < from + count; i++) {
        low = Math.min(low, read(i));
        high = Math.max(high, read(i));
      }
      return { low, high };
    };
    const y = (i: number) => position.getY(i);
    const height = span(first, base + shaft + capital, y).high;
    expect(height).toBeCloseTo(0.35, 2);
    const plinth = span(first, base, y);
    const abacus = span(first + base + shaft, capital, y);
    // Base and capital take no more than half the column, so half of it is shaft.
    expect(abacus.low - plinth.high).toBeGreaterThanOrEqual(height / 2 - 1e-3);
    expect(abacus.high).toBeCloseTo(height, 3);
    // Square to the row: the plinth is as long along the row as across it, and narrower than its
    // diagonal, which it would show along a turned row if it stood square to the world.
    const along = new Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
    const across = new Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
    const point = new Vector3();
    const extent = (direction: Vector3) =>
      span(first, base, (i) => point.fromBufferAttribute(position, i).dot(direction));
    const alongRow = extent(along);
    const acrossRow = extent(across);
    expect(alongRow.high - alongRow.low).toBeCloseTo(acrossRow.high - acrossRow.low, 2);
    expect(alongRow.high - alongRow.low).toBeLessThan(0.8);

    pillars.dispose();
  });

  it('leaves the Plaza row in plain air on the lowest tier, as the square is', () => {
    const ctx = { ...stubContext(), quality: qualitySettings('low') };
    const haze = new HazedCopies(new SharedUniforms(PLAZA));
    const project: Project = { ...PROJECT, languages: { TypeScript: 1 } };
    const pillars = new LanguagePillars({ ...options(project), skin: 'plaza', haze });
    pillars.init(ctx);

    const mesh = ctx.scene.getObjectByName('language-pillars') as Mesh;
    expect(mesh).toBeInstanceOf(Mesh);
    expect((mesh.material as MeshStandardMaterial).customProgramCacheKey()).not.toContain(
      'atmosphere',
    );
    pillars.dispose();
  });
});

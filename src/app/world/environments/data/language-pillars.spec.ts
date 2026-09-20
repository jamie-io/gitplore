import { Color, Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { LANGUAGE_COLOURS, LanguagePillars } from './language-pillars';

const PROJECT = PROJECT_FIXTURES[0];
const options = (project: Project) => ({
  project,
  origin: new Vector3(0, 0, -12),
  rotationY: 0,
  ground: { heightAt: () => 0 },
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
});

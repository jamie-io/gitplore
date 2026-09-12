import { Texture } from 'three';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { ShowroomEnvironment } from '../environments/showroom';
import { createProjectScene } from './create-project-scene';
import { ProjectScene } from './project.scene';

const options = (project: Project) => ({
  environment: new ShowroomEnvironment({ reducedMotion: () => true }),
  project,
  reducedMotion: () => true,
  onOpenInfo: () => undefined,
  onLeave: () => undefined,
  textures: { load: () => new Texture(), release: () => undefined },
});

describe('createProjectScene', () => {
  it('gives a curated slug its bespoke scene', async () => {
    const project = PROJECT_FIXTURES.find((candidate) => candidate.slug === 'deslopify')!;

    const scene = await createProjectScene(options(project));

    expect(scene.constructor.name).toBe('DeslopifyScene');
  });

  it('gives the demoshop its furnished showroom', async () => {
    const project = { ...PROJECT_FIXTURES[0], slug: 'webkatalog_demoshop' };

    const scene = await createProjectScene(options(project));

    expect(scene.constructor.name).toBe('WebkatalogScene');
  });

  it('gives Phönix its spray booth', async () => {
    const project = { ...PROJECT_FIXTURES[0], slug: 'novaverta' };

    const scene = await createProjectScene(options(project));

    expect(scene.constructor.name).toBe('NovavertaScene');
  });

  it('gives every other slug the generic scene', async () => {
    const project = PROJECT_FIXTURES.find((candidate) => candidate.slug === 'poetzscher')!;

    const scene = await createProjectScene(options(project));

    expect(scene.constructor).toBe(ProjectScene);
  });
});

import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { ShowroomEnvironment } from '../../environments/showroom';
import { PoetzscherScene } from './poetzscher.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'poetzscher')!;

function scene(): PoetzscherScene {
  return new PoetzscherScene({
    environment: new ShowroomEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

describe('PoetzscherScene', () => {
  it('keeps the exhibit and the way back', () => {
    const prompts = scene().interactables.map((interactable) => interactable.prompt);

    expect(prompts.some((prompt) => prompt.startsWith('Zurück'))).toBe(true);
  });

  it('stands the plant wall beside the exhibit', () => {
    expect(Math.abs(scene().plant.centre.x)).toBeGreaterThan(4);
  });

  it('blocks the plant as well as the hall', () => {
    const plain = new ShowroomEnvironment({ reducedMotion: () => true }).colliders.length;

    expect(scene().colliders.length).toBeGreaterThan(plain + 1);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = scene();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { JungleEnvironment } from '../../environments/jungle';
import { DeslopifyScene } from './deslopify.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'deslopify')!;

function scene(): DeslopifyScene {
  return new DeslopifyScene({
    environment: new JungleEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    onDemo: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

describe('DeslopifyScene', () => {
  it('offers the video wall alongside the exhibit and the way back', () => {
    const prompts = scene().interactables.map((interactable) => interactable.prompt);

    expect(prompts).toContain('Deslopify ausprobieren');
    expect(prompts.some((prompt) => prompt.startsWith('Zurück'))).toBe(true);
  });

  it('flips the card titles when the demo is used, and puts them back on exit', () => {
    const target = scene();
    target.init(stubContext());

    target.wall.interact();
    expect(target.wall.showingOriginals).toBe(true);

    target.wall.exit();
    expect(target.wall.showingOriginals).toBe(false);
  });

  it('blocks the wall as well as the environment', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const plain = environment.colliders.length;

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

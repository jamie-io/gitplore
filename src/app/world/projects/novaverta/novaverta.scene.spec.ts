import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { ShowroomEnvironment } from '../../environments/showroom';
import { NovavertaScene } from './novaverta.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'novaverta')!;

function scene(): NovavertaScene {
  return new NovavertaScene({
    environment: new ShowroomEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

describe('NovavertaScene', () => {
  it('keeps the exhibit and the way back', () => {
    const prompts = scene().interactables.map((interactable) => interactable.prompt);

    expect(prompts.some((prompt) => prompt.startsWith('Zurück'))).toBe(true);
  });

  it('stands the booth beside the exhibit rather than on top of it', () => {
    const target = scene();

    expect(Math.abs(target.booth.opening.x)).toBeGreaterThan(4);
  });

  it('leaves the booth open enough to walk into', () => {
    const target = scene();
    const opening = target.booth.opening;

    const blocked = target.colliders.some(
      (collider) =>
        collider.kind === 'aabb' &&
        opening.x >= collider.minX &&
        opening.x <= collider.maxX &&
        opening.z >= collider.minZ &&
        opening.z <= collider.maxZ,
    );

    expect(blocked).toBe(false);
  });

  it('blocks the booth as well as the hall', () => {
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

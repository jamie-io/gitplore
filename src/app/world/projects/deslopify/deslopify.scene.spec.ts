import { Mesh, Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { clearance } from '../../environments/testing/clearance';
import { JungleEnvironment } from '../../environments/jungle';
import { EXAMPLE_VIDEOS } from './video-wall';
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

  it('places the signs clear of the arrival path and the jungle', () => {
    const target = scene();
    const environment = new JungleEnvironment({ reducedMotion: () => true });

    for (const position of target.signs.positions) {
      expect(clearance(position.x, position.z, environment.colliders)).toBeGreaterThan(0.5);
      expect(Math.abs(position.x) - 1.4).toBeGreaterThan(4);
    }
    expect(target.signs.pairCount).toBe(EXAMPLE_VIDEOS.length);
  });

  it('offers the jungle cave behind the waterfall inside the Deslopify world', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const target = new DeslopifyScene({
      environment,
      project: PROJECT,
      reducedMotion: () => true,
      onOpenInfo: () => undefined,
      onLeave: () => undefined,
      textures: { load: () => new Texture(), release: () => undefined },
    });

    expect(target.colliders).toEqual(expect.arrayContaining([...environment.cave.colliders]));
    expect(target.interactables).toEqual(
      expect.arrayContaining([...environment.cave.interactables]),
    );
  });

  it('keeps signs clear of exhibit, portal, cave, and T9 data interactables', () => {
    const target = scene();

    for (const sign of target.signs.positions) {
      for (const interactable of target.interactables) {
        expect(
          Math.hypot(sign.x - interactable.position.x, sign.z - interactable.position.z),
        ).toBeGreaterThan(2.5);
      }
    }
  });

  it('disposes cave, signs, and every created sign texture', () => {
    const ctx = stubContext();
    const target = scene();
    target.init(ctx);
    const signMeshes: Mesh[] = [];
    ctx.scene.traverse((child) => {
      if (child instanceof Mesh && child.name.startsWith('jungle-sign')) {
        signMeshes.push(child);
      }
    });
    const materials = signMeshes.flatMap((mesh) =>
      mesh.material instanceof Array ? mesh.material : [mesh.material],
    );
    const disposals = materials.map((material) => vi.spyOn(material, 'dispose'));

    target.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
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

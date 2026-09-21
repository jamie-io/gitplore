import { Mesh, Texture, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { clearance } from '../../environments/testing/clearance';
import { JungleEnvironment, POOL } from '../../environments/jungle';
import { EXAMPLE_VIDEOS } from './video-wall';
import { DeslopifyScene } from './deslopify.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'deslopify')!;
const WATERFALL_MIN_X = POOL.x - 2.25;
const WATERFALL_MAX_X = POOL.x + 2.25;
const WATERFALL_LIP_Z = -49.5;
const WATERFALL_LANDING_Z = -47.8;
const HIDDEN_PLACE_OPENING_OFFSET = 1.21;

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

function caveOpening(target: DeslopifyScene): Vector3 {
  return target.cave.position.clone().add(new Vector3(0, 0, HIDDEN_PLACE_OPENING_OFFSET));
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

  it('places waterfall cave and signs clear of the arrival path and existing world objects', () => {
    const target = scene();
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const opening = caveOpening(target);

    expect(opening.x).toBeGreaterThanOrEqual(WATERFALL_MIN_X);
    expect(opening.x).toBeLessThanOrEqual(WATERFALL_MAX_X);
    expect(opening.z).toBeGreaterThanOrEqual(WATERFALL_LIP_Z);
    expect(opening.z).toBeLessThanOrEqual(WATERFALL_LANDING_Z);
    expect(clearance(opening.x, opening.z, environment.colliders)).toBeGreaterThanOrEqual(0.35);
    expect(clearance(target.cave.position.x, target.cave.position.z, environment.colliders)).toBeGreaterThan(
      0.5,
    );

    for (const position of target.signs.positions) {
      expect(clearance(position.x, position.z, environment.colliders)).toBeGreaterThan(0.5);
      expect(Math.abs(position.x) - 1.4).toBeGreaterThan(4);
    }
    expect(target.signs.pairCount).toBe(EXAMPLE_VIDEOS.length);
    expect(target.colliders).toContain(target.cave.colliders[0]);
  });

  it('keeps the waterfall sheet non-colliding while cave remains reachable', () => {
    const target = scene();
    const opening = caveOpening(target);
    expect(target.cave.colliders).toHaveLength(3);
    expect(
      clearance(opening.x, opening.z, new JungleEnvironment({ reducedMotion: () => true }).colliders),
    ).toBeGreaterThanOrEqual(0.35);
    expect(target.cave.interactables[0].position.distanceTo(target.arrival.position)).toBeLessThan(60);

    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const route = [
      target.arrival.position,
      new Vector3(14, 0, -48.5),
      new Vector3(11.5, 0, -48.5),
      new Vector3(11.5, 0, -49.4),
      new Vector3(9, 0, -49.4),
      target.cave.position,
    ];
    for (let segment = 0; segment < route.length - 1; segment++) {
      for (let step = 0; step <= 8; step++) {
        const point = route[segment].clone().lerp(route[segment + 1], step / 8);
        expect(
          clearance(point.x, point.z, environment.colliders),
          `route segment ${segment}, step ${step} at ${point.x},${point.z}`,
        ).toBeGreaterThanOrEqual(0.35);
      }
    }
  });

  it('keeps signs clear of exhibit, portal, cave, and T9 data interactables', () => {
    const target = scene();

    for (const sign of target.signs.positions) {
      for (const interactable of target.interactables) {
        expect(Math.hypot(sign.x - interactable.position.x, sign.z - interactable.position.z)).toBeGreaterThan(2.5);
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

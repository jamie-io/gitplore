import { Mesh, Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { JungleEnvironment } from '../environments/jungle';
import { PlazaEnvironment } from '../environments/plaza';
import { ShowroomEnvironment } from '../environments/showroom';
import { ProjectScene, ProjectSceneOptions } from './project.scene';

const PROJECT = PROJECT_FIXTURES[0];

function scene(overrides: Partial<ProjectSceneOptions> = {}): ProjectScene {
  return new ProjectScene({
    environment: new ShowroomEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    // Reduced motion on purpose: it skips the portal's camera dolly, so `onInteract` reports
    // straight away instead of only after `update` has run the glide to its end.
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
    ...overrides,
  });
}

function use(target: ProjectScene, match: RegExp): void {
  const interactable = target.interactables.find((candidate) => match.test(candidate.prompt));
  expect(interactable, `no interactable matching ${match}`).toBeDefined();
  interactable?.onInteract();
}

describe('ProjectScene', () => {
  it('stands the exhibit on the environment’s first anchor', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const [anchor] = environment.anchors(1);
    const target = scene({ environment });

    const exhibit = target.landmarks.find((landmark) => landmark.id.includes(PROJECT.slug));

    expect(exhibit?.position.x).toBeCloseTo(anchor.position[0], 5);
    expect(exhibit?.position.z).toBeCloseTo(anchor.position[2], 5);
  });

  it('puts the way back at the arrival point, behind the player', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const target = scene({ environment });

    // The player arrives a few metres past the portal, looking the way the environment says.
    expect(target.arrival.yaw).toBeCloseTo(environment.spawnYaw, 5);
    const toPlayer = target.arrival.position.clone().sub(environment.spawn);
    expect(toPlayer.length()).toBeGreaterThan(0);
    expect(toPlayer.length()).toBeLessThan(6);
  });

  it('reports the project when the exhibit is used, so the panel can open', () => {
    const opened: Project[] = [];
    use(scene({ onOpenInfo: (project) => opened.push(project) }), /ansehen/);

    expect(opened).toEqual([PROJECT]);
  });

  it('reports a departure when the return portal is used', () => {
    let left = 0;
    use(scene({ onLeave: () => left++ }), /Zurück/);

    expect(left).toBe(1);
  });

  it('gives the two landmarks different interactable ids, so the HUD can tell them apart', () => {
    const ids = scene().interactables.map((interactable) => interactable.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('blocks what the environment blocks as well as its own landmarks', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });
    const target = scene({ environment });

    expect(target.colliders.length).toBeGreaterThan(environment.colliders.length);
  });

  it('walks on the environment’s ground', () => {
    const environment = new ShowroomEnvironment({ reducedMotion: () => true });

    expect(scene({ environment }).ground).toBe(environment.ground);
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

  it('adds repository data objects to the world', () => {
    const project: Project = {
      ...PROJECT,
      languages: { TypeScript: 100 },
      commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 12 ? 4 : 0)),
      releases: [{ name: 'v1.0.0', date: '2026-01-01T00:00:00Z' }],
      stars: 0,
    };
    const ctx = stubContext();
    const target = scene({ project });

    target.init(ctx);

    expect(ctx.scene.getObjectByName('commit-ridge')).toBeDefined();
    expect(ctx.scene.getObjectByName('language-pillars')).toBeDefined();
    expect(ctx.scene.getObjectByName('release-markers')).toBeDefined();
    expect(ctx.scene.getObjectByName('star-lanterns')).toBeDefined();

    target.dispose();
  });

  it('keeps a capped language row on its side of the walk', () => {
    const project: Project = {
      ...PROJECT,
      languages: Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [
          `Language ${index.toString().padStart(2, '0')}`,
          1,
        ]),
      ),
    };
    const ctx = stubContext();
    const target = scene({ project });

    target.init(ctx);

    const pillars = ctx.scene.getObjectByName('language-pillars');
    expect(pillars).toBeInstanceOf(Mesh);
    expect((pillars as Mesh).geometry.boundingBox?.min.x).toBeGreaterThan(0);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it.each([
    ['Showroom', () => new ShowroomEnvironment({ reducedMotion: () => true })],
    ['Dschungel', () => new JungleEnvironment({ reducedMotion: () => true })],
    ['Plaza', () => new PlazaEnvironment({ reducedMotion: () => true })],
  ] as const)('keeps the %s arrival walk at or below 25 metres', (_name, buildEnvironment) => {
    const target = scene({ environment: buildEnvironment() });
    const exhibit = target.landmarks.find((landmark) => landmark.id.includes(PROJECT.slug));

    expect(exhibit).toBeDefined();
    const distance = Math.hypot(
      target.arrival.position.x - (exhibit?.position.x ?? 0),
      target.arrival.position.z - (exhibit?.position.z ?? 0),
    );
    expect(distance).toBeLessThanOrEqual(25);
  });
});

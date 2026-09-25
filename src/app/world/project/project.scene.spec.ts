import { Mesh, Texture, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import type { ToyLayout } from '../environments/environment';
import { JungleEnvironment } from '../environments/jungle';
import { BAMBOO, CAIRNS, LIANA, RIDGE, STELE } from '../environments/jungle-layout';
import { PlazaEnvironment } from '../environments/plaza';
import { ShowroomEnvironment } from '../environments/showroom';
import { clearance } from '../environments/testing/clearance';
import { ProjectScene, ProjectSceneOptions } from './project.scene';

/**
 * A fake environment whose `toyLayout()` lays out every toy but the lever — everything the jungle
 * already lays out, minus the one field this task makes optional — to test that `ProjectScene`
 * copes with an environment that has no lever spot at all.
 */
class WithoutLeverEnvironment extends JungleEnvironment {
  override toyLayout(): ToyLayout {
    const { terminal, ridge, languages, releases, stars } = super.toyLayout();
    return { terminal, ridge, languages, releases, stars };
  }
}

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

  it('adds the terminal and seed lever beside, not on, the arrival walk', () => {
    const target = scene();
    const prompts = target.interactables.map((interactable) => interactable.prompt);
    const walk = target.landmarks[0].position.clone().sub(target.arrival.position);
    walk.y = 0;
    const length = walk.length();
    walk.normalize();

    expect(prompts).toContain('Terminal bedienen');
    expect(prompts).toContain('Dekoration neu würfeln');
    expect(target.landmarks).toHaveLength(2);
    expect(target.colliders).toContainEqual(target.terminal.colliders[0]);
    // The default (Showroom) environment lays out no toys of its own, so `walkLayout` always
    // gives it a lever.
    expect(target.seedLever).not.toBeNull();
    expect(target.colliders).toContainEqual(target.seedLever!.colliders[0]);

    for (const prop of [target.terminal, target.seedLever!]) {
      const fromArrival = prop.position.clone().sub(target.arrival.position);
      const along = fromArrival.dot(walk);
      const lateral = Math.abs(fromArrival.x * walk.z - fromArrival.z * walk.x);
      expect(along).toBeGreaterThan(0);
      expect(along).toBeLessThan(length);
      expect(lateral).toBeGreaterThan(3.5);
    }
  });

  it('builds no seed lever when the environment lays out none', () => {
    const target = scene({
      environment: new WithoutLeverEnvironment({ reducedMotion: () => true }),
    });

    expect(target.seedLever).toBeNull();
    expect(
      target.interactables.some((interactable) => interactable.id.endsWith(':seed-lever:pull')),
    ).toBe(false);

    const ctx = stubContext();
    target.init(ctx);
    expect(() => target.dispose()).not.toThrow();
  });

  it('still builds the seed lever everywhere else', () => {
    expect(scene().seedLever).not.toBeNull();
  });

  it.each([
    ['Showroom', () => new ShowroomEnvironment({ reducedMotion: () => true })],
    ['Dschungel', () => new JungleEnvironment({ reducedMotion: () => true })],
    ['Plaza', () => new PlazaEnvironment({ reducedMotion: () => true })],
  ] as const)('keeps both toys clear of %s environment colliders', (_name, buildEnvironment) => {
    const environment = buildEnvironment();
    const target = scene({ environment });
    const toys = [target.terminal, target.seedLever].filter((toy) => toy !== null);

    for (const prop of toys) {
      expect(
        clearance(prop.position.x, prop.position.z, environment.colliders),
        `${prop.id} at (${prop.position.x.toFixed(2)}, ${prop.position.z.toFixed(2)}) overlaps environment`,
      ).toBeGreaterThan(0.5);
    }
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

  it('stands the explorer in the world and takes them away with it', () => {
    const ctx = stubContext();
    const target = scene();

    target.init(ctx);
    expect(ctx.scene.children).toContain(target.avatar.object);

    target.dispose();
    expect(target.avatar.object.parent).toBeNull();
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

  it('stands the toys where the jungle lays them out, off the straight walk', () => {
    const project: Project = {
      ...PROJECT,
      environment: 'jungle',
      languages: { TypeScript: 70, JavaScript: 30 },
      commitBuckets: Array.from({ length: 52 }, (_, index) => 1 + (index % 5)),
      releases: [
        { name: 'v1.0.0', date: '2025-06-01T00:00:00Z' },
        { name: 'v2.0.0', date: '2025-09-01T00:00:00Z' },
      ],
    };
    const ctx = stubContext();
    const target = scene({
      project,
      environment: new JungleEnvironment({ reducedMotion: () => true }),
    });

    expect(target.terminal.position.x).toBeCloseTo(STELE.position.x, 6);
    expect(target.terminal.position.z).toBeCloseTo(STELE.position.z, 6);
    // The jungle's own `toyLayout()` still lays out a lever, at the liana.
    expect(target.seedLever).not.toBeNull();
    expect(target.seedLever!.position.x).toBeCloseTo(LIANA.position.x, 6);
    expect(target.seedLever!.position.z).toBeCloseTo(LIANA.position.z, 6);

    target.init(ctx);
    const centre = (name: string) => {
      const mesh = ctx.scene.getObjectByName(name) as Mesh;
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.getCenter(new Vector3()).setY(0);
    };
    const ridge = RIDGE.from.clone().lerp(RIDGE.to, 0.5);
    expect(centre('commit-ridge').distanceTo(ridge)).toBeLessThan(0.5);
    expect(centre('language-pillars').distanceTo(BAMBOO.position)).toBeLessThan(1.5);
    expect(centre('release-markers').distanceTo(CAIRNS.position)).toBeLessThan(2.5);

    target.dispose();
  });

  it('passes poster copy through to the exhibit', () => {
    const poster = {
      kicker: 'Projekt · Test',
      englishSummary: 'A test.',
      comparison: { without: 'ohne', with: 'with' },
    };
    const target = scene({ poster });
    const exhibit = (target as unknown as { exhibit: Record<string, unknown> }).exhibit;

    expect(exhibit['kicker']).toBe(poster.kicker);
    expect(exhibit['englishSummary']).toBe(poster.englishSummary);
    expect(exhibit['comparison']).toEqual(poster.comparison);
    expect(
      (scene() as unknown as { exhibit: Record<string, unknown> }).exhibit['kicker'],
    ).toBeUndefined();
  });

  // Not the jungle: Deslopify's walk from the arrival over the bridge is the demo itself, 15–20 s
  // long by design (jungle-layout.spec.ts holds it to that).
  it.each([
    ['Showroom', () => new ShowroomEnvironment({ reducedMotion: () => true })],
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

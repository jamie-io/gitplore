import { Mesh, Points, Texture, Vector3 } from 'three';
import type { GroundPoint, StationPlate } from '@engine/stations/station';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import type { WorldScene } from '@engine/world-object';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import type { ToyLayout } from '../environments/environment';
import { JungleEnvironment } from '../environments/jungle';
import { BAMBOO, CAIRN, LIANA, STELE } from '../environments/jungle-layout';
import { PlazaEnvironment } from '../environments/plaza';
import { EASEL_WIDEN, EXHIBIT_EASEL_MODEL } from '../environments/props/exhibit-easel';
import { ShowroomEnvironment } from '../environments/showroom';
import { clearance } from '../environments/testing/clearance';
import { ProjectScene, ProjectSceneOptions } from './project.scene';
import { ReturnPortal } from './return.landmark';

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

  it('stands the way back where the environment places it, the visitor on its spawn in front', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const target = scene({ environment });
    const way = target.landmarks.find((landmark) => landmark instanceof ReturnPortal);

    expect(way?.position.x).toBeCloseTo(environment.returnPortal.position[0], 10);
    expect(way?.position.z).toBeCloseTo(environment.returnPortal.position[2], 10);
    expect(way?.rotationY).toBe(environment.returnPortal.rotationY);
    // The visitor stands on the environment's spawn, the portal at their back.
    expect(target.arrival.position.x).toBeCloseTo(environment.spawn.x, 10);
    expect(target.arrival.position.z).toBeCloseTo(environment.spawn.z, 10);
    expect(target.arrival.yaw).toBeCloseTo(environment.spawnYaw, 10);
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

  it('stands the toys where the jungle lays them out, the steps in place of the ridge', () => {
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

    expect(target.terminal.position.x).toBeCloseTo(STELE.x, 6);
    expect(target.terminal.position.z).toBeCloseTo(STELE.z, 6);
    // The jungle's own `toyLayout()` still lays out a lever, at the liana.
    expect(target.seedLever).not.toBeNull();
    expect(target.seedLever!.position.x).toBeCloseTo(LIANA.x, 6);
    expect(target.seedLever!.position.z).toBeCloseTo(LIANA.z, 6);

    target.init(ctx);
    const centre = (name: string) => {
      const mesh = ctx.scene.getObjectByName(name) as Mesh;
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.getCenter(new Vector3()).setY(0);
    };
    expect(ctx.scene.getObjectByName('commit-ridge')).toBeUndefined();
    // Two languages: the two largest shares' stalks, at the deck's two north corners.
    const stalks = new Vector3((BAMBOO[0].x + BAMBOO[1].x) / 2, 0, (BAMBOO[0].z + BAMBOO[1].z) / 2);
    expect(centre('language-pillars').distanceTo(stalks)).toBeLessThan(0.5);
    expect(ctx.scene.getObjectByName('language-pillars-sign')).toBeUndefined();
    expect(centre('release-markers').distanceTo(new Vector3(CAIRN.x, 0, CAIRN.z))).toBeLessThan(
      2.5,
    );

    target.dispose();
  });

  it('has no stations, portal stand, overview, pitch, glide path or plates of its own', () => {
    const target: WorldScene = scene();

    expect(target.stations).toBeUndefined();
    expect(target.portalStand).toBeUndefined();
    expect(target.overview).toBeUndefined();
    expect(target.pitch).toBeUndefined();
    expect(target.glidePath).toBeUndefined();
    expect(target.plateAt).toBeUndefined();
  });

  it('hands a bespoke scene’s stations, stands, shots and plates to the director', () => {
    const plate = { kicker: 'Fund', title: 'Test', text: 'Text', en: 'Text' };
    const stations = [
      { id: 'a', name: 'A', stand: { x: 1, z: 2, yaw: 0 }, trigger: 3, plate: () => plate },
    ];
    class Bespoke extends ProjectScene {
      override get stations() {
        return stations;
      }
      override get portalStand() {
        return { x: 0, z: 5, yaw: 0 };
      }
      override get overview() {
        return { position: { x: 0, y: 20, z: 30 }, target: { x: 0, y: 0, z: 0 } };
      }
      override get pitch() {
        return { title: 'T', line: 'L' };
      }
      override glidePath(from: GroundPoint, to: GroundPoint): readonly GroundPoint[] {
        return [from, { x: 9, z: 9 }, to];
      }
      override plateAt(): StationPlate | null {
        return plate;
      }
    }
    const target: WorldScene = new Bespoke({
      environment: new ShowroomEnvironment({ reducedMotion: () => true }),
      project: PROJECT,
      reducedMotion: () => true,
      onOpenInfo: () => undefined,
      onLeave: () => undefined,
    });

    expect(target.stations).toBe(stations);
    expect(target.portalStand).toEqual({ x: 0, z: 5, yaw: 0 });
    expect(target.overview?.position.y).toBe(20);
    expect(target.pitch?.title).toBe('T');
    expect(target.glidePath?.({ x: 0, z: 0 }, { x: 1, z: 1 })).toHaveLength(3);
    expect(target.plateAt?.(0, 0)).toBe(plate);
  });

  describe('with an environment that lays out stations', () => {
    const plate = { kicker: 'Station 1', title: 'Brunnen', text: 'Text', en: 'Text' };
    const laidOut = [
      {
        id: 'well',
        name: 'Brunnen',
        stand: { x: 3, z: 4, yaw: 1 },
        trigger: 2,
        plate: () => plate,
      },
    ];
    /** Its path reads a field of its own, so an unbound call would lose it. */
    class Laid extends ShowroomEnvironment {
      readonly via: GroundPoint = { x: 7, z: 7 };
      readonly portalStand = { x: 0, z: 9, yaw: Math.PI };
      stations() {
        return laidOut;
      }
      glidePath(from: GroundPoint, to: GroundPoint): readonly GroundPoint[] {
        return [from, this.via, to];
      }
    }
    const options = (): ProjectSceneOptions => ({
      environment: new Laid({ reducedMotion: () => true }),
      project: PROJECT,
      reducedMotion: () => true,
      onOpenInfo: () => undefined,
      onLeave: () => undefined,
    });

    it('hands its stations, portal stand and path on to the director', () => {
      const target: WorldScene = new ProjectScene(options());

      expect(target.stations).toBe(laidOut);
      expect(target.portalStand).toEqual({ x: 0, z: 9, yaw: Math.PI });
      const glidePath = target.glidePath;
      // Called detached, as a caller holding only the function would.
      expect(glidePath?.({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual([
        { x: 0, z: 0 },
        { x: 7, z: 7 },
        { x: 1, z: 1 },
      ]);
    });

    it('lets a bespoke scene’s own stations, stand and path win over the environment’s', () => {
      const own = [{ ...laidOut[0], id: 'own' }];
      class Bespoke extends ProjectScene {
        override get stations() {
          return own;
        }
        override get portalStand() {
          return { x: 0, z: 5, yaw: 0 };
        }
        override glidePath(from: GroundPoint, to: GroundPoint): readonly GroundPoint[] {
          return [from, to];
        }
      }
      const target: WorldScene = new Bespoke(options());

      expect(target.stations).toBe(own);
      expect(target.portalStand).toEqual({ x: 0, z: 5, yaw: 0 });
      expect(target.glidePath?.({ x: 0, z: 0 }, { x: 1, z: 1 })).toHaveLength(2);
    });
  });

  it('stands the jungle’s exhibit inside its easel, and no easel anywhere else', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const target = scene({ project: { ...PROJECT, environment: 'jungle' }, environment });
    const ctx = stubContext();
    target.init(ctx);

    const easel = ctx.scene.getObjectByName('exhibit-easel')!;
    const exhibit = target.landmarks[0];
    expect(easel).toBeDefined();
    expect(easel.position.x).toBeCloseTo(exhibit.position.x, 6);
    expect(easel.position.z).toBeCloseTo(exhibit.position.z, 6);
    expect(easel.rotation.y).toBeCloseTo(exhibit.rotationY, 6);
    expect(easel.scale.x).toBeCloseTo(EASEL_WIDEN, 6);
    expect((ctx.assets as StubAssets).requested).toContain(EXHIBIT_EASEL_MODEL);
    target.dispose();

    const plain = scene();
    const plainCtx = stubContext();
    plain.init(plainCtx);
    expect(plainCtx.scene.getObjectByName('exhibit-easel')).toBeUndefined();
    plain.dispose();
  });

  it('flies the jungle’s fireflies over the exhibit glade whatever the stars', () => {
    const environment = new JungleEnvironment({ reducedMotion: () => true });
    const target = scene({ project: { ...PROJECT, stars: 0, environment: 'jungle' }, environment });
    const ctx = stubContext();
    target.init(ctx);

    const swarm = ctx.scene.getObjectByName('star-lanterns') as Points;
    expect(swarm.geometry.getAttribute('position').count).toBe(14);
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

  // Not the jungle: Deslopify's tour from the portal is the demo itself, at most 60 m by design
  // (jungle-layout.spec.ts holds it to that).
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

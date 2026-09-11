import { PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import type { Project, ProjectLandmark } from '@content/project.model';
import { PROJECT_FIXTURES as PROJECTS } from '@content/testing/project-fixtures';
import { ClearingEnvironment } from '../environments/clearing';
import { ringPlacements } from '../environments/placement';
import { terrainHeightAt } from '../environments/terrain';
import { HubScene, HubSceneOptions } from './hub.scene';

const CLEARING = 'Lichtung';

function context(): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
    assets: new StubAssets(),
  };
}

function hub(overrides: Partial<HubSceneOptions> = {}): HubScene {
  return new HubScene({
    environment: new ClearingEnvironment({ reducedMotion: () => false }),
    reducedMotion: () => false,
    projects: PROJECTS,
    onEnter: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
    ...overrides,
  });
}

/**
 * A project fixture built from scratch rather than derived from `PROJECTS`, so placement tests
 * neither pass nor fail because of unrelated changes to the curated content.
 */
function syntheticProject(slug: string, landmark: ProjectLandmark): Project {
  return {
    slug,
    title: `Fixture ${slug}`,
    summary: 'Synthetic project used only to test HubScene placement.',
    tags: [],
    repoUrl: `https://example.invalid/${slug}`,
    demo: { kind: 'none' },
    landmark,
    environment: 'showroom',
    theme: { primary: '#000000', accent: '#ffffff' },
  };
}

describe('HubScene', () => {
  it('reports ground height straight from the terrain', () => {
    expect(hub().ground.heightAt(40, -25)).toBe(terrainHeightAt(40, -25));
  });

  it('builds terrain, sky and a landmark per project into the scene', () => {
    const ctx = context();
    const scene = hub();

    scene.init(ctx);

    expect(scene.landmarks.length).toBe(PROJECTS.length);
    expect(ctx.scene.children.length).toBeGreaterThan(1 + PROJECTS.length);
  });

  it('collects the colliders and interactables of every landmark', () => {
    const environment = new ClearingEnvironment({ reducedMotion: () => false });
    const scene = hub({ environment });

    const colliders =
      environment.colliders.length + scene.landmarks.reduce((n, l) => n + l.colliders.length, 0);
    const interactables = scene.landmarks.reduce((n, l) => n + l.interactables.length, 0);
    expect(scene.colliders.length).toBe(colliders);
    expect(scene.interactables.length).toBe(interactables);
    expect(interactables).toBeGreaterThanOrEqual(PROJECTS.length);
  });

  it('takes its ground, its spawn and its layout from the environment it is given', () => {
    const environment = new ClearingEnvironment({ reducedMotion: () => false });
    const scene = hub({ environment });

    expect(scene.ground).toBe(environment.ground);
    expect(scene.spawn).toBe(environment.spawn);
    expect(scene.colliders).toEqual(expect.arrayContaining([...environment.colliders]));
  });

  it('finds a landmark by project slug', () => {
    expect(hub().landmarkFor('deslopify')?.project.slug).toBe('deslopify');
    expect(hub().landmarkFor('nope')).toBeUndefined();
  });

  it('empties the scene again when disposed', () => {
    const ctx = context();
    const scene = hub();
    scene.init(ctx);

    scene.dispose();

    expect(ctx.scene.children).toEqual([]);
  });

  it('spawns the player on the flat centre', () => {
    const scene = hub();

    expect(scene.spawn.y).toBe(0);
    expect(scene.ground.heightAt(scene.spawn.x, scene.spawn.z)).toBe(0);
  });

  describe('placement', () => {
    it('keeps a pinned project at its authored position and rotation', () => {
      const pinned = syntheticProject('pinned-only', {
        kind: 'portal',
        position: [12, 0, -7],
        rotationY: 1.234,
      });
      const scene = hub({ projects: [pinned] });

      const landmark = scene.landmarkFor('pinned-only')!;

      // Y is derived from ground.heightAt, not authored, so only X/Z/rotation are checked here.
      expect(landmark.position.x).toBe(12);
      expect(landmark.position.z).toBe(-7);
      expect(landmark.rotationY).toBe(1.234);
    });

    it('gives unpinned projects ring spots in list order, leaving pinned neighbours untouched', () => {
      const pinnedA = syntheticProject('pinned-a', {
        kind: 'portal',
        position: [5, 0, 5],
        rotationY: 1,
      });
      const unpinnedB = syntheticProject('unpinned-b', { kind: 'portal' });
      const pinnedC = syntheticProject('pinned-c', {
        kind: 'portal',
        position: [-9, 0, 2],
        rotationY: -1,
      });
      const unpinnedD = syntheticProject('unpinned-d', { kind: 'portal' });
      const scene = hub({ projects: [pinnedA, unpinnedB, pinnedC, unpinnedD] });

      // Two unpinned projects above, so this is the exact ring they should be drawing from.
      const ring = ringPlacements(2);
      const b = scene.landmarkFor('unpinned-b')!;
      const d = scene.landmarkFor('unpinned-d')!;
      expect(b.position.x).toBeCloseTo(ring[0].position[0], 5);
      expect(b.position.z).toBeCloseTo(ring[0].position[2], 5);
      expect(b.rotationY).toBeCloseTo(ring[0].rotationY, 5);
      expect(d.position.x).toBeCloseTo(ring[1].position[0], 5);
      expect(d.position.z).toBeCloseTo(ring[1].position[2], 5);
      expect(d.rotationY).toBeCloseTo(ring[1].rotationY, 5);

      const a = scene.landmarkFor('pinned-a')!;
      const c = scene.landmarkFor('pinned-c')!;
      expect(a.position.x).toBe(5);
      expect(a.position.z).toBe(5);
      expect(a.rotationY).toBe(1);
      expect(c.position.x).toBe(-9);
      expect(c.position.z).toBe(2);
      expect(c.rotationY).toBe(-1);
    });
  });

  describe('areas', () => {
    it('names the clearing at the start and a landmark once the player is close', () => {
      const areas: string[] = [];
      const ctx = context();
      const scene = hub({ onAreaChange: (area) => areas.push(area) });
      scene.init(ctx);

      scene.update(0.016, ctx);
      const target = scene.landmarkFor('deslopify')!;
      ctx.player.teleport(target.spawn.clone().setY(1.7));
      scene.update(0.016, ctx);

      expect(areas).toEqual([CLEARING, target.project.title]);
    });

    it('reports an area only when it changes', () => {
      const areas: string[] = [];
      const ctx = context();
      const scene = hub({ onAreaChange: (area) => areas.push(area) });
      scene.init(ctx);

      scene.update(0.016, ctx);
      ctx.player.teleport(new Vector3(1, 1.7, 1));
      scene.update(0.016, ctx);

      expect(areas).toEqual([CLEARING]);
    });
  });
});

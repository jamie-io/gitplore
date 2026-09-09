import { PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECTS } from '@content/projects';
import { HubScene, HubSceneOptions, HUB_AREA } from './hub.scene';
import { terrainHeightAt } from './terrain';

function context(): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
  };
}

function hub(overrides: Partial<HubSceneOptions> = {}): HubScene {
  return new HubScene({
    reducedMotion: false,
    projects: PROJECTS,
    onEnter: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
    ...overrides,
  });
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
    const scene = hub();

    expect(scene.colliders.length).toBeGreaterThanOrEqual(PROJECTS.length);
    expect(scene.interactables.length).toBe(PROJECTS.length);
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

      expect(areas).toEqual([HUB_AREA, target.project.title]);
    });

    it('reports an area only when it changes', () => {
      const areas: string[] = [];
      const ctx = context();
      const scene = hub({ onAreaChange: (area) => areas.push(area) });
      scene.init(ctx);

      scene.update(0.016, ctx);
      ctx.player.teleport(new Vector3(1, 1.7, 1));
      scene.update(0.016, ctx);

      expect(areas).toEqual([HUB_AREA]);
    });
  });
});

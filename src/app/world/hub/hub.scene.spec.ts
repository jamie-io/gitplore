import { PerspectiveCamera, Scene } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { HubScene } from './hub.scene';
import { terrainHeightAt } from './terrain';

function context(): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
  };
}

describe('HubScene', () => {
  it('reports ground height straight from the terrain', () => {
    const hub = new HubScene({ reducedMotion: false });

    expect(hub.ground.heightAt(40, -25)).toBe(terrainHeightAt(40, -25));
  });

  it('builds terrain and sky into the scene', () => {
    const ctx = context();
    const hub = new HubScene({ reducedMotion: false });

    hub.init(ctx);

    expect(ctx.scene.children.length).toBeGreaterThan(1);
  });

  it('starts with nothing to bump into until landmarks arrive', () => {
    expect(new HubScene({ reducedMotion: false }).colliders).toEqual([]);
  });

  it('empties the scene again when disposed', () => {
    const ctx = context();
    const hub = new HubScene({ reducedMotion: false });
    hub.init(ctx);

    hub.dispose();

    expect(ctx.scene.children).toEqual([]);
  });

  it('spawns the player on the flat centre', () => {
    const hub = new HubScene({ reducedMotion: false });

    expect(hub.spawn.y).toBe(0);
    expect(hub.ground.heightAt(hub.spawn.x, hub.spawn.z)).toBe(0);
  });
});

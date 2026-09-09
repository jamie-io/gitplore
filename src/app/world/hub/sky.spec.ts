import { PerspectiveCamera, Scene } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { Sky } from './sky';

function context(tier: 'low' | 'medium' | 'high' = 'high'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
  };
}

describe('Sky', () => {
  it('puts a dome and lighting into the scene', () => {
    const ctx = context();

    new Sky({ reducedMotion: false }).init(ctx);

    expect(ctx.scene.children.length).toBeGreaterThan(1);
  });

  it('fogs the scene to the draw distance of the quality tier', () => {
    const ctx = context('low');

    new Sky({ reducedMotion: false }).init(ctx);

    expect(ctx.scene.fog).not.toBeNull();
  });

  it('drifts over time', () => {
    const ctx = context();
    const sky = new Sky({ reducedMotion: false });
    sky.init(ctx);
    const before = sky.rotation;

    sky.update(1);

    expect(sky.rotation).not.toBe(before);
  });

  it('holds still when the visitor prefers reduced motion', () => {
    const ctx = context();
    const sky = new Sky({ reducedMotion: true });
    sky.init(ctx);

    sky.update(10);

    expect(sky.rotation).toBe(0);
  });

  it('takes everything back out of the scene when disposed', () => {
    const ctx = context();
    const sky = new Sky({ reducedMotion: false });
    sky.init(ctx);

    sky.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(ctx.scene.fog).toBeNull();
  });
});

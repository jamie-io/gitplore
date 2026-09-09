import { Group, Mesh, PerspectiveCamera, Scene } from 'three';
import { AssetLike } from '@engine/asset.service';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { MONUMENT_MODEL, Monument } from './monument';

function context(assets: AssetLike): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
    assets,
  };
}

describe('Monument', () => {
  it('asks the asset service for its model on init', () => {
    const assets = new StubAssets();
    const monument = new Monument();

    monument.init(context(assets));

    expect(assets.requested).toEqual([MONUMENT_MODEL]);
  });

  it('shows a proxy until the model arrives, then swaps it in', async () => {
    const assets = new StubAssets();
    const ctx = context(assets);
    const monument = new Monument();
    monument.init(ctx);

    const proxy = ctx.scene.getObjectByName('monument-proxy');
    expect(proxy).toBeDefined();

    const model = new Group();
    model.add(new Mesh());
    await assets.resolve(model);

    expect(ctx.scene.getObjectByName('monument-proxy')).toBeUndefined();
    expect(ctx.scene.getObjectByName('monument')?.children).toContain(model);
  });

  it('blocks the player with a cylinder around its base', () => {
    const monument = new Monument();

    // Behind the spawn, so the visitor first sees the portals and finds it on turning round.
    expect(monument.colliders[0]).toMatchObject({ kind: 'cylinder', x: 0, z: 9 });
    expect(
      monument.colliders[0].kind === 'cylinder' && monument.colliders[0].radius,
    ).toBeGreaterThan(2);
  });

  it('gives the model back and leaves the scene empty on dispose', async () => {
    const assets = new StubAssets();
    const ctx = context(assets);
    const monument = new Monument();
    monument.init(ctx);
    await assets.resolve();

    monument.dispose();

    expect(assets.releasedModels).toEqual([MONUMENT_MODEL]);
    expect(ctx.scene.children).toEqual([]);
  });

  it('ignores a model that arrives after dispose', async () => {
    const assets = new StubAssets();
    const ctx = context(assets);
    const monument = new Monument();
    monument.init(ctx);

    monument.dispose();
    await assets.resolve();

    expect(ctx.scene.children).toEqual([]);
    expect(assets.releasedModels).toEqual([MONUMENT_MODEL]);
  });
});

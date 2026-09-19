import { Color, Fog, Mesh, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { GALERIE, LICHTUNG, Mood } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Sky } from './sky';

function context(tier: 'low' | 'medium' | 'high' = 'high'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function sky(mood: Mood = LICHTUNG, shared = new SharedUniforms(mood)): Sky {
  return new Sky({ mood, shared });
}

function dome(ctx: WorldContext): Mesh<never, ShaderMaterial> {
  const found = ctx.scene.getObjectByName('sky-dome');
  if (!(found instanceof Mesh)) {
    throw new Error('no sky dome in the scene');
  }
  return found as Mesh<never, ShaderMaterial>;
}

describe('Sky', () => {
  it('adds the dome to the scene', () => {
    const ctx = context();

    sky().init(ctx);

    expect(ctx.scene.children).toContain(dome(ctx));
  });

  it("fogs the scene in the mood's fog colour", () => {
    const ctx = context();

    sky().init(ctx);

    expect(ctx.scene.fog).toBeInstanceOf(Fog);
    expect((ctx.scene.fog as Fog).color).toEqual(new Color(LICHTUNG.fog.color));
    expect((ctx.scene.fog as Fog).near).toBe(LICHTUNG.fog.near);
  });

  it('never fogs further than the quality tier draws', () => {
    const ctx = context('low');

    sky().init(ctx);

    expect((ctx.scene.fog as Fog).far).toBeLessThanOrEqual(qualitySettings('low').fogFar);
  });

  it('sets a background, so nothing shows through before the dome is drawn', () => {
    const ctx = context();

    sky().init(ctx);

    expect(ctx.scene.background).toBeInstanceOf(Color);
  });

  it('compiles the clouds out on the low tier', () => {
    const ctx = context('low');

    sky().init(ctx);

    expect(dome(ctx).material.defines['CLOUDS']).toBeUndefined();
  });

  it('moves the gradient into the vertex shader on the low tier only', () => {
    const low = context('low');
    const medium = context('medium');

    sky().init(low);
    sky().init(medium);

    expect(dome(low).material.defines['VERTEX_GRADIENT']).toBeDefined();
    expect(dome(medium).material.defines['VERTEX_GRADIENT']).toBeUndefined();
  });

  it('gives the clouds more octaves on the high tier than on medium', () => {
    const medium = context('medium');
    const high = context('high');

    sky().init(medium);
    sky().init(high);

    expect(dome(medium).material.defines['CLOUDS']).toBeDefined();
    expect(dome(high).material.defines['FBM_OCTAVES']).toBeGreaterThan(
      dome(medium).material.defines['FBM_OCTAVES'] as number,
    );
  });

  it('draws no clouds for a mood without any, whatever the tier', () => {
    const ctx = context('high');

    sky(GALERIE).init(ctx);

    expect(dome(ctx).material.defines['CLOUDS']).toBeUndefined();
  });

  it('binds the shared uniforms by identity, so one update reaches the dome', () => {
    const ctx = context();
    const shared = new SharedUniforms(LICHTUNG);

    sky(LICHTUNG, shared).init(ctx);

    const { uniforms } = dome(ctx).material;
    expect(uniforms['time']).toBe(shared.time);
    expect(uniforms['sunDirection']).toBe(shared.sunDirection);
    expect(uniforms['sunColor']).toBe(shared.sunColor);
  });

  it('ends its fragment shader with the tone mapping and colour-space chunks', () => {
    // The post stack relies on these being the last thing the sky does: they are no-ops under
    // the composer and the same curve as everything else when drawn straight to the canvas.
    const ctx = context();

    sky().init(ctx);

    const source = dome(ctx).material.fragmentShader.trimEnd();
    expect(
      source.endsWith('#include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}'),
    ).toBe(true);
  });

  it("follows the camera's x and z, so the horizon never slides", () => {
    const ctx = context();
    const object = sky();
    object.init(ctx);
    ctx.camera.position.set(12, 1.7, -30);

    object.update(0.016, ctx);

    expect(dome(ctx).position.x).toBe(12);
    expect(dome(ctx).position.z).toBe(-30);
    expect(dome(ctx).position.y).toBe(0);
  });

  it('takes the dome, the fog and the background back out when disposed', () => {
    const ctx = context();
    const object = sky();
    object.init(ctx);

    object.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(ctx.scene.fog).toBeNull();
    expect(ctx.scene.background).toBeNull();
  });
});

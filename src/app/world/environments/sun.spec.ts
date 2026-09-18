import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { LICHTUNG, Mood, sunDirection } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Sun } from './sun';

function context(tier: 'low' | 'medium' | 'high' = 'high'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function sun(mood: Mood = LICHTUNG): Sun {
  return new Sun({ mood, shared: new SharedUniforms(mood) });
}

function directionOf(sun: Sun): Vector3 {
  return sun.light.position.clone().sub(sun.light.target.position).normalize();
}

/** Side of one shadow texel on the high tier: an 80 m box over a 2048 map. */
const TEXEL = 80 / 2048;

describe('Sun', () => {
  it("shines from the mood's sun direction", () => {
    const expected = sunDirection(LICHTUNG);
    const actual = directionOf(sun());

    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
  });

  it('keeps that direction while following the visitor', () => {
    const ctx = context();
    const object = sun();
    object.init(ctx);
    ctx.player.position.set(-27.4, 1.7, 61.9);

    object.update(0.016, ctx);

    const expected = sunDirection(LICHTUNG);
    const actual = directionOf(object);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
  });

  it('puts the sun, its target and the sky light into the scene', () => {
    const ctx = context();

    sun().init(ctx);

    expect(ctx.scene.children).toHaveLength(3);
    expect(ctx.scene.children.filter((child) => child instanceof DirectionalLight)).toHaveLength(1);
    expect(ctx.scene.children.filter((child) => child instanceof HemisphereLight)).toHaveLength(1);
    expect(ctx.scene.children).toContain(sunOf(ctx).target);
  });

  it("lights undersides with the mood's ground colour", () => {
    const ctx = context();

    sun().init(ctx);

    const hemisphere = ctx.scene.children.find((child) => child instanceof HemisphereLight);
    expect(hemisphere?.groundColor.getHex()).toBe(LICHTUNG.hemisphere.ground);
  });

  it('casts no shadow on the low tier', () => {
    const ctx = context('low');

    sun().init(ctx);

    expect(sunOf(ctx).castShadow).toBe(false);
  });

  it('casts a 1024-texel shadow on the medium tier', () => {
    const ctx = context('medium');

    sun().init(ctx);

    expect(sunOf(ctx).castShadow).toBe(true);
    expect(sunOf(ctx).shadow.mapSize.x).toBe(1024);
    expect(sunOf(ctx).shadow.mapSize.y).toBe(1024);
  });

  it('casts a 2048-texel shadow on the high tier', () => {
    const ctx = context('high');

    sun().init(ctx);

    expect(sunOf(ctx).castShadow).toBe(true);
    expect(sunOf(ctx).shadow.mapSize.x).toBe(2048);
    expect(sunOf(ctx).shadow.mapSize.y).toBe(2048);
  });

  it('keeps the shadow box on the visitor, within one texel', () => {
    const ctx = context('high');
    const object = sun();
    object.init(ctx);
    ctx.player.position.set(13.37, 1.7, -42.1);

    object.update(0.016, ctx);

    expect(object.light.target.position.distanceTo(ctx.player.position)).toBeLessThan(TEXEL);
  });

  it('moves the box in whole texels, so shadow edges do not crawl', () => {
    const ctx = context('high');
    const object = sun();
    object.init(ctx);
    let previous = object.light.target.position.clone();

    for (let step = 1; step <= 40; step++) {
      ctx.player.position.set(step * TEXEL * 0.1, 1.7, step * TEXEL * 0.07);
      object.update(0.016, ctx);
      const moved = object.light.target.position.distanceTo(previous);
      if (moved > 0) {
        expect(moved).toBeGreaterThanOrEqual(TEXEL * 0.999);
      }
      previous = object.light.target.position.clone();
    }
  });

  it('takes both lights and the target back out when disposed', () => {
    const ctx = context();
    const object = sun();
    object.init(ctx);

    object.dispose();

    expect(ctx.scene.children).toEqual([]);
  });
});

function sunOf(ctx: WorldContext): DirectionalLight {
  const found = ctx.scene.children.find((child) => child instanceof DirectionalLight);
  if (!found) {
    throw new Error('no directional light in the scene');
  }
  return found;
}

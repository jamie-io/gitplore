import { AdditiveBlending, PerspectiveCamera, Points, Scene, ShaderMaterial } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { LICHTUNG } from './mood';
import { Motes, MotesOptions } from './motes';
import { SharedUniforms } from './shaders/shared-uniforms';

function context(tier: 'low' | 'medium' | 'high' = 'high'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function options(overrides: Partial<MotesOptions> = {}): MotesOptions {
  return {
    shared: new SharedUniforms(LICHTUNG),
    seed: 7,
    count: 200,
    area: { x: 0, z: 0, radius: 12, minY: -1, maxY: 2.5 },
    followCamera: true,
    colour: 0xffe9a8,
    size: 0.05,
    glow: 1.6,
    drift: 1.5,
    flicker: 0,
    ...overrides,
  };
}

function pointsIn(ctx: WorldContext): Points {
  const points = ctx.scene.children[0];
  expect(points).toBeInstanceOf(Points);
  return points as Points;
}

function positionsOf(points: Points): number[] {
  return Array.from(points.geometry.getAttribute('position').array);
}

describe('Motes', () => {
  it('scales the point count with the density of the quality tier', () => {
    const counts = (['high', 'medium', 'low'] as const).map((tier) => {
      const ctx = context(tier);
      new Motes(options({ count: 200 })).init(ctx);
      return pointsIn(ctx).geometry.getAttribute('position').count;
    });

    // Low halves it again on top of its density, so SwiftShader has less additive overdraw.
    expect(counts).toEqual([200, 120, 25]);
  });

  it('lays the points out the same way for the same seed', () => {
    const [first, second] = [context(), context()];

    new Motes(options({ seed: 42 })).init(first);
    new Motes(options({ seed: 42 })).init(second);

    expect(positionsOf(pointsIn(first))).toEqual(positionsOf(pointsIn(second)));
  });

  it('lays the points out differently for another seed', () => {
    const [first, second] = [context(), context()];

    new Motes(options({ seed: 1 })).init(first);
    new Motes(options({ seed: 2 })).init(second);

    expect(positionsOf(pointsIn(first))).not.toEqual(positionsOf(pointsIn(second)));
  });

  it('keeps a fixed swarm inside its area and height band', () => {
    const ctx = context();
    const area = { x: 30, z: -10, radius: 5, minY: 1, maxY: 3 };

    new Motes(options({ followCamera: false, area })).init(ctx);

    const positions = positionsOf(pointsIn(ctx));
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i] - area.x, positions[i + 2] - area.z)).toBeLessThanOrEqual(
        area.radius,
      );
      expect(positions[i + 1]).toBeGreaterThanOrEqual(area.minY);
      expect(positions[i + 1]).toBeLessThanOrEqual(area.maxY);
    }
  });

  it('shares the world clock by identity, so one update reaches the shader', () => {
    const ctx = context();
    const shared = new SharedUniforms(LICHTUNG);

    new Motes(options({ shared })).init(ctx);

    const material = pointsIn(ctx).material as ShaderMaterial;
    expect(material.uniforms['time']).toBe(shared.time);
  });

  it('draws additively without writing depth, so motes never cut holes into each other', () => {
    const ctx = context();

    new Motes(options()).init(ctx);

    const material = pointsIn(ctx).material as ShaderMaterial;
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
  });

  it('never culls a cloud that follows the camera, and bounds a fixed one', () => {
    const following = context();
    const fixed = context();

    new Motes(options({ followCamera: true })).init(following);
    new Motes(options({ followCamera: false })).init(fixed);

    expect(pointsIn(following).frustumCulled).toBe(false);
    expect(pointsIn(fixed).geometry.boundingSphere?.radius).toBeGreaterThan(12);
  });

  it('does nothing on the CPU per frame', () => {
    const ctx = context();
    const motes = new Motes(options());
    motes.init(ctx);
    const before = positionsOf(pointsIn(ctx));

    motes.update();

    expect(positionsOf(pointsIn(ctx))).toEqual(before);
  });

  it('takes everything back out of the scene when disposed', () => {
    const ctx = context();
    const motes = new Motes(options());
    motes.init(ctx);
    const material = pointsIn(ctx).material as ShaderMaterial;
    const dispose = vi.spyOn(material, 'dispose');

    motes.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(dispose).toHaveBeenCalled();
  });

  it('survives being disposed before init or twice', () => {
    const motes = new Motes(options());

    expect(() => {
      motes.dispose();
      motes.init(context());
      motes.dispose();
      motes.dispose();
    }).not.toThrow();
  });
});

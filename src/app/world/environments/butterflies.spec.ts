import {
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { Butterflies, ButterfliesOptions } from './butterflies';
import { LICHTUNG } from './mood';
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

const FLAT = { heightAt: () => 2 };

function options(overrides: Partial<ButterfliesOptions> = {}): ButterfliesOptions {
  return {
    shared: new SharedUniforms(LICHTUNG),
    seed: 11,
    count: 20,
    area: { x: 0, z: -30, radius: 12, height: 1.2 },
    colours: [0xffb347, 0x8fd3ff, 0xfff1a8],
    ground: FLAT,
    ...overrides,
  };
}

function meshIn(ctx: WorldContext): Mesh {
  const mesh = ctx.scene.children[0];
  expect(mesh).toBeInstanceOf(Mesh);
  return mesh as Mesh;
}

function geometryOf(mesh: Mesh): InstancedBufferGeometry {
  return mesh.geometry as InstancedBufferGeometry;
}

function centresOf(mesh: Mesh): number[] {
  return Array.from(geometryOf(mesh).getAttribute('iCentre').array);
}

describe('Butterflies', () => {
  it('scales the instance count with the density of the quality tier', () => {
    const counts = (['high', 'medium', 'low'] as const).map((tier) => {
      const ctx = context(tier);
      new Butterflies(options({ count: 20 })).init(ctx);
      return geometryOf(meshIn(ctx)).instanceCount;
    });

    expect(counts).toEqual([20, 12, 5]);
  });

  it('draws two double-sided wing quads per butterfly', () => {
    const ctx = context();

    new Butterflies(options()).init(ctx);

    const mesh = meshIn(ctx);
    expect(geometryOf(mesh).getAttribute('position').count).toBe(8);
    expect(geometryOf(mesh).index?.count).toBe(12);
    expect((mesh.material as ShaderMaterial).side).toBe(DoubleSide);
  });

  it('places the flock the same way for the same seed', () => {
    const [first, second] = [context(), context()];

    new Butterflies(options({ seed: 5 })).init(first);
    new Butterflies(options({ seed: 5 })).init(second);

    expect(centresOf(meshIn(first))).toEqual(centresOf(meshIn(second)));
  });

  it('places the flock differently for another seed', () => {
    const [first, second] = [context(), context()];

    new Butterflies(options({ seed: 5 })).init(first);
    new Butterflies(options({ seed: 6 })).init(second);

    expect(centresOf(meshIn(first))).not.toEqual(centresOf(meshIn(second)));
  });

  it('hovers each loop the given height above the ground and inside the area', () => {
    const ctx = context();
    const area = { x: 10, z: -30, radius: 12, height: 1.2 };

    new Butterflies(options({ area })).init(ctx);

    const centres = centresOf(meshIn(ctx));
    const loops = Array.from(geometryOf(meshIn(ctx)).getAttribute('iLoop').array);
    for (let i = 0; i < centres.length / 3; i++) {
      expect(centres[i * 3 + 1]).toBeCloseTo(2 + area.height, 5);
      const reach = Math.max(loops[i * 4], loops[i * 4 + 1]);
      expect(
        Math.hypot(centres[i * 3] - area.x, centres[i * 3 + 2] - area.z) + reach,
      ).toBeLessThanOrEqual(area.radius + 1e-6);
    }
  });

  it('lifts a loop over the highest ground it crosses, not just its centre', () => {
    const ctx = context();
    // A ridge at x > 0: a loop centred left of it still swings across.
    const ridge = { heightAt: (x: number) => (x > 0 ? 6 : 0) };

    new Butterflies(options({ ground: ridge, area: { x: 0, z: 0, radius: 6, height: 1 } })).init(
      ctx,
    );

    const centres = centresOf(meshIn(ctx));
    const loops = Array.from(geometryOf(meshIn(ctx)).getAttribute('iLoop').array);
    for (let i = 0; i < centres.length / 3; i++) {
      const crossesRidge = centres[i * 3] + loops[i * 4] > 0;
      expect(centres[i * 3 + 1]).toBeCloseTo(crossesRidge ? 7 : 1, 5);
    }
  });

  it('gives every butterfly one of the offered colours', () => {
    const ctx = context();
    const colours = [0xff0000, 0x00ff00];
    const linear = colours.map((hex) => new Color(hex));

    new Butterflies(options({ colours })).init(ctx);

    const tints = Array.from(geometryOf(meshIn(ctx)).getAttribute('iColour').array);
    for (let i = 0; i < tints.length; i += 3) {
      const match = linear.some(
        (colour) =>
          Math.abs(colour.r - tints[i]) < 1e-6 &&
          Math.abs(colour.g - tints[i + 1]) < 1e-6 &&
          Math.abs(colour.b - tints[i + 2]) < 1e-6,
      );
      expect(match).toBe(true);
    }
  });

  it('shares the world clock and sun by identity, so one update reaches the shader', () => {
    const ctx = context();
    const shared = new SharedUniforms(LICHTUNG);

    new Butterflies(options({ shared })).init(ctx);

    const material = meshIn(ctx).material as ShaderMaterial;
    expect(material.uniforms['time']).toBe(shared.time);
    expect(material.uniforms['sunDirection']).toBe(shared.sunDirection);
    expect(material.fog).toBe(true);
  });

  it('bounds the whole flock for frustum culling, not just the wing quad', () => {
    const ctx = context();

    new Butterflies(options()).init(ctx);

    const sphere = geometryOf(meshIn(ctx)).boundingSphere;
    expect(sphere?.radius).toBeGreaterThan(12);
    expect(sphere?.center.z).toBe(-30);
  });

  it('does nothing on the CPU per frame', () => {
    const ctx = context();
    const butterflies = new Butterflies(options());
    butterflies.init(ctx);
    const before = centresOf(meshIn(ctx));

    butterflies.update();

    expect(centresOf(meshIn(ctx))).toEqual(before);
  });

  it('takes everything back out of the scene when disposed', () => {
    const ctx = context();
    const butterflies = new Butterflies(options());
    butterflies.init(ctx);
    const geometry = geometryOf(meshIn(ctx));
    const dispose = vi.spyOn(geometry, 'dispose');

    butterflies.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(dispose).toHaveBeenCalled();
  });

  it('survives being disposed before init or twice', () => {
    const butterflies = new Butterflies(options());

    expect(() => {
      butterflies.dispose();
      butterflies.init(context());
      butterflies.dispose();
      butterflies.dispose();
    }).not.toThrow();
  });
});

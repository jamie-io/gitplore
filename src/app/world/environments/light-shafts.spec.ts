import {
  AdditiveBlending,
  InstancedMesh,
  Matrix4,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { LightShafts, LightShaftOptions } from './light-shafts';
import { DSCHUNGEL } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';

const SHAFTS = [
  { x: 0, z: -8, radius: 1.6, height: 30 },
  { x: -6, z: -16, radius: 1.2, height: 30 },
  { x: 5, z: -23, radius: 2.0, height: 24 },
] as const;

function options(shared = new SharedUniforms(DSCHUNGEL)): LightShaftOptions {
  return { shared, shafts: SHAFTS, colour: 0xf2ffd0, intensity: 1.4 };
}

function context(tier: 'low' | 'medium' | 'high'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function shaftsIn(ctx: WorldContext): InstancedMesh {
  const mesh = ctx.scene.getObjectByName('light-shafts');
  if (!(mesh instanceof InstancedMesh)) {
    throw new Error('no light shafts in the scene');
  }
  return mesh;
}

/** The world-space direction of one instance's local Y axis, the cylinder's axis. */
function axisOf(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3(0, 1, 0).transformDirection(matrix).normalize();
}

describe('LightShafts', () => {
  it('draws one instance per shaft', () => {
    const ctx = stubContext();

    new LightShafts(options()).init(ctx);

    expect(shaftsIn(ctx).count).toBe(SHAFTS.length);
  });

  it('tilts every shaft along the sun direction, so they all fall in parallel', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const ctx = stubContext();

    new LightShafts(options(shared)).init(ctx);

    const mesh = shaftsIn(ctx);
    const sun = shared.sunDirection.value;
    for (let i = 0; i < SHAFTS.length; i++) {
      expect(axisOf(mesh, i).distanceTo(sun)).toBeLessThan(1e-6);
    }
  });

  it('stands each shaft on its ground point and lets it rise its own height towards the sun', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const ctx = stubContext();

    new LightShafts(options(shared)).init(ctx);

    const mesh = shaftsIn(ctx);
    const matrix = new Matrix4();
    const sun = shared.sunDirection.value;
    SHAFTS.forEach((shaft, i) => {
      mesh.getMatrixAt(i, matrix);
      const centre = new Vector3().setFromMatrixPosition(matrix);
      // Wherever the foot is buried, the axis crosses y = 0 at (x, z).
      const ground = centre.clone().addScaledVector(sun, -centre.y / sun.y);
      expect(ground.x).toBeCloseTo(shaft.x, 5);
      expect(ground.z).toBeCloseTo(shaft.z, 5);
      const scale = new Vector3().setFromMatrixScale(matrix);
      expect(scale.y).toBeCloseTo(shaft.height, 5);
      expect(scale.x).toBeCloseTo(shaft.radius, 5);
      expect(scale.z).toBeCloseTo(shaft.radius, 5);
    });
  });

  it('adds light without writing depth, so a shaft never cuts into the trees it crosses', () => {
    const ctx = stubContext();

    new LightShafts(options()).init(ctx);

    const material = shaftsIn(ctx).material as ShaderMaterial;
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.fog).toBe(false);
  });

  it('shares the world clock by identity, so reduced motion holds the shafts still too', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const ctx = stubContext();

    new LightShafts(options(shared)).init(ctx);

    const material = shaftsIn(ctx).material as ShaderMaterial;
    expect(material.uniforms['time']).toBe(shared.time);
    expect(material.uniforms['intensity'].value).toBe(1.4);
  });

  it('compiles the noise out on the low tier and keeps it elsewhere', () => {
    const low = context('low');
    const high = context('high');
    new LightShafts(options()).init(low);
    new LightShafts(options()).init(high);

    expect((shaftsIn(low).material as ShaderMaterial).defines?.['SHAFT_NOISE']).toBe(0);
    expect((shaftsIn(high).material as ShaderMaterial).defines?.['SHAFT_NOISE']).toBe(2);
    expect(shaftsIn(low).geometry.getAttribute('position').count).toBeLessThan(
      shaftsIn(high).geometry.getAttribute('position').count,
    );
  });

  it('keeps the beam as strong when the tier gains or drops the post stack under it', () => {
    const medium = context('medium');
    const shafts = new LightShafts(options());
    shafts.init(medium);
    const gain = (shaftsIn(medium).material as ShaderMaterial).uniforms['gain'];
    const direct = gain.value;

    shafts.update(0.016, { ...medium, quality: qualitySettings('high') });
    expect(gain.value).toBe(1);
    expect(direct).toBeLessThan(1);

    shafts.update(0.016, medium);
    expect(gain.value).toBe(direct);
  });

  it('takes itself back out of the scene when disposed', () => {
    const ctx = stubContext();
    const shafts = new LightShafts(options());
    shafts.init(ctx);
    const material = shaftsIn(ctx).material as ShaderMaterial;
    const disposed = vi.fn();
    material.addEventListener('dispose', disposed);

    shafts.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('survives being disposed twice or before init', () => {
    const shafts = new LightShafts(options());

    expect(() => shafts.dispose()).not.toThrow();
    shafts.init(stubContext());
    shafts.dispose();
    expect(() => shafts.dispose()).not.toThrow();
  });
});

import { BufferAttribute, Mesh, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { LICHTUNG } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Water, WaterOptions } from './water';

const LEVEL = -0.4;
const CENTRE: readonly [number, number] = [30, -20];
const RADIUS = 6;

/** A bowl: 1.2 m below the water line at the centre, rising through it at the rim. */
const bowl = {
  heightAt(x: number, z: number): number {
    const r = Math.hypot(x - CENTRE[0], z - CENTRE[1]) / RADIUS;
    return LEVEL - 1.2 + 1.5 * r * r;
  },
};

function options(shared = new SharedUniforms(LICHTUNG)): WaterOptions {
  return {
    shared,
    mood: LICHTUNG,
    centre: CENTRE,
    radius: RADIUS,
    level: LEVEL,
    ground: bowl,
    colours: { shallow: 0x5f9c8a, deep: 0x1d4a5c, foam: 0xf4f7f2 },
  };
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

function surface(ctx: WorldContext): Mesh {
  const mesh = ctx.scene.getObjectByName('water');
  if (!(mesh instanceof Mesh)) {
    throw new Error('no water in the scene');
  }
  return mesh;
}

describe('Water', () => {
  it('sits at the water level over the centre it was given', () => {
    const ctx = stubContext();

    new Water(options()).init(ctx);

    const mesh = surface(ctx);
    expect(mesh.position.y).toBe(LEVEL);
    expect(mesh.position.x).toBe(CENTRE[0]);
    expect(mesh.position.z).toBe(CENTRE[1]);
  });

  it('bakes the depth over the bed into every vertex', () => {
    const ctx = stubContext();
    new Water(options()).init(ctx);
    const geometry = surface(ctx).geometry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const depth = geometry.getAttribute('aDepth') as BufferAttribute;

    expect(depth.itemSize).toBe(1);
    expect(depth.count).toBe(position.count);
    for (const i of [0, Math.floor(position.count / 3), position.count - 1]) {
      const x = CENTRE[0] + position.getX(i);
      const z = CENTRE[1] + position.getZ(i);
      expect(depth.getX(i)).toBeCloseTo(LEVEL - bowl.heightAt(x, z), 5);
    }
    // The centre is the deepest point and the rim is out of the water.
    expect(depth.getX(0)).toBeCloseTo(1.2, 5);
    expect(depth.getX(position.count - 1)).toBeLessThan(0);
  });

  it('faces up, so the front side is the one the visitor sees', () => {
    const ctx = stubContext();
    new Water(options()).init(ctx);
    const geometry = surface(ctx).geometry.clone();

    geometry.computeVertexNormals();

    const normal = geometry.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getY(i)).toBeCloseTo(1, 5);
    }
  });

  it('is drawn over the bed without writing depth, so nothing fights at the shoreline', () => {
    const ctx = stubContext();

    new Water(options()).init(ctx);

    const material = surface(ctx).material as ShaderMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.fog).toBe(true);
  });

  it('shares the world clock and sun by identity, so one update reaches it', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const ctx = stubContext();

    new Water(options(shared)).init(ctx);

    const { uniforms } = surface(ctx).material as ShaderMaterial;
    expect(uniforms['time']).toBe(shared.time);
    expect(uniforms['sunDirection']).toBe(shared.sunDirection);
    expect(uniforms['sunColor']).toBe(shared.sunColor);
    expect(uniforms['heightFog']).toBe(shared.heightFog);
  });

  it('declares the fog uniforms Three refreshes from the scene', () => {
    const ctx = stubContext();

    new Water(options()).init(ctx);

    const { uniforms } = surface(ctx).material as ShaderMaterial;
    expect(uniforms['fogColor']).toBeDefined();
    expect(uniforms['fogNear']).toBeDefined();
    expect(uniforms['fogFar']).toBeDefined();
  });

  it('spends fewer vertices and ripple layers on the low tier', () => {
    const low = context('low');
    const high = context('high');
    new Water(options()).init(low);
    new Water(options()).init(high);

    const lowMesh = surface(low);
    const highMesh = surface(high);
    expect(lowMesh.geometry.getAttribute('position').count).toBeLessThan(
      highMesh.geometry.getAttribute('position').count,
    );
    expect((lowMesh.material as ShaderMaterial).defines?.['WATER_LAYERS']).toBe(1);
    expect((highMesh.material as ShaderMaterial).defines?.['WATER_LAYERS']).toBe(3);
  });

  it('takes itself back out of the scene when disposed', () => {
    const ctx = stubContext();
    const water = new Water(options());
    water.init(ctx);
    const material = surface(ctx).material as ShaderMaterial;
    const disposed = vi.fn();
    material.addEventListener('dispose', disposed);

    water.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('survives being disposed twice or before init', () => {
    const water = new Water(options());

    expect(() => water.dispose()).not.toThrow();
    water.init(stubContext());
    water.dispose();
    expect(() => water.dispose()).not.toThrow();
  });
});

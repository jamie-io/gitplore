import {
  AdditiveBlending,
  BufferAttribute,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { FountainJets, FountainJetsOptions } from './fountain-jets';
import { PLAZA } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';

const ORIGIN: readonly [number, number, number] = [2, 3.62, -1];
const REACH = 3;
const HEIGHT = 1;
const LANDING = 0.58;

function options(shared = new SharedUniforms(PLAZA)): FountainJetsOptions {
  return {
    shared,
    origin: ORIGIN,
    jets: 8,
    reach: REACH,
    height: HEIGHT,
    landing: LANDING,
    colour: 0xe8f8ff,
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

function meshNamed(ctx: WorldContext, name: string): Mesh {
  const mesh = ctx.scene.getObjectByName(name);
  if (!(mesh instanceof Mesh)) {
    throw new Error(`no ${name} in the scene`);
  }
  return mesh;
}

/** World-space vertices of a mesh that is only translated. */
function worldVertices(mesh: Mesh): { x: number; y: number; z: number }[] {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  return Array.from({ length: position.count }, (_, i) => ({
    x: position.getX(i) + mesh.position.x,
    y: position.getY(i) + mesh.position.y,
    z: position.getZ(i) + mesh.position.z,
  }));
}

describe('FountainJets', () => {
  it('throws its arcs out to the reach and no further', () => {
    const ctx = stubContext();
    new FountainJets(options()).init(ctx);

    const spans = worldVertices(meshNamed(ctx, 'fountain-jets')).map((v) =>
      Math.hypot(v.x - ORIGIN[0], v.z - ORIGIN[2]),
    );

    expect(Math.min(...spans)).toBeLessThan(0.2);
    expect(Math.max(...spans)).toBeGreaterThan(REACH - 0.2);
    expect(Math.max(...spans)).toBeLessThan(REACH + 0.2);
  });

  it('peaks at the height above the spout and ends at the landing', () => {
    const ctx = stubContext();
    new FountainJets(options()).init(ctx);

    const heights = worldVertices(meshNamed(ctx, 'fountain-jets')).map((v) => v.y);

    expect(Math.max(...heights)).toBeGreaterThan(ORIGIN[1] + HEIGHT - 0.2);
    expect(Math.max(...heights)).toBeLessThan(ORIGIN[1] + HEIGHT + 0.2);
    expect(Math.min(...heights)).toBeGreaterThan(LANDING - 0.1);
    expect(Math.min(...heights)).toBeLessThan(LANDING + 0.1);
  });

  it('spreads the jets evenly around the spout', () => {
    const ctx = stubContext();
    new FountainJets(options()).init(ctx);

    const far = worldVertices(meshNamed(ctx, 'fountain-jets')).filter(
      (v) => Math.hypot(v.x - ORIGIN[0], v.z - ORIGIN[2]) > REACH - 0.3,
    );
    const angles = new Set(
      far.map((v) => Math.round((Math.atan2(v.z - ORIGIN[2], v.x - ORIGIN[0]) * 8) / Math.PI)),
    );

    expect(angles.size).toBe(8);
  });

  it('lands each jet in spray and a splash ring on the water', () => {
    const ctx = stubContext();
    new FountainJets(options()).init(ctx);

    const spray = ctx.scene.children.filter((child) => child instanceof Points);
    expect(spray).toHaveLength(8);
    for (const cloud of spray) {
      const position = (cloud as Points).geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const out = Math.hypot(position.getX(i) - ORIGIN[0], position.getZ(i) - ORIGIN[2]);
        expect(out).toBeGreaterThan(REACH - 0.6);
        expect(out).toBeLessThan(REACH + 0.6);
      }
    }
    const splash = meshNamed(ctx, 'fountain-splash');
    const heights = worldVertices(splash).map((v) => v.y);
    expect(Math.min(...heights)).toBeGreaterThan(LANDING);
    expect(Math.max(...heights)).toBeLessThan(LANDING + 0.05);
  });

  it('gathers the spray into one cloud on the low tier, where every draw call counts', () => {
    const ctx = context('low');
    new FountainJets(options()).init(ctx);

    const spray = ctx.scene.children.filter((child) => child instanceof Points);
    expect(spray).toHaveLength(1);
  });

  it('shares the world clock by identity, so reduced motion freezes it', () => {
    const shared = new SharedUniforms(PLAZA);
    const ctx = stubContext();

    new FountainJets(options(shared)).init(ctx);

    for (const name of ['fountain-jets', 'fountain-splash']) {
      const { uniforms } = meshNamed(ctx, name).material as ShaderMaterial;
      expect(uniforms['time']).toBe(shared.time);
    }
    const { uniforms } = meshNamed(ctx, 'fountain-jets').material as ShaderMaterial;
    expect(uniforms['sunDirection']).toBe(shared.sunDirection);
    expect(uniforms['sunColor']).toBe(shared.sunColor);
  });

  it('never raises a negative base to a power, which multisampling would shade to NaN', () => {
    // With MSAA a fragment on a triangle's edge interpolates its varyings at the pixel centre,
    // which can lie outside the triangle, so a 0–1 varying overshoots. `pow` of a negative base
    // is NaN, and the strongest tier's bloom spreads one NaN pixel across the whole view.
    const ctx = stubContext();

    new FountainJets(options()).init(ctx);

    for (const name of ['fountain-jets', 'fountain-splash']) {
      const { fragmentShader } = meshNamed(ctx, name).material as ShaderMaterial;
      const bases = fragmentShader.match(/pow\([a-z]*/g) ?? [];
      for (const base of bases) {
        expect(['pow(max', 'pow(clamp'], `${name}: ${base}`).toContain(base);
      }
    }
  });

  it('draws additively without writing depth, so the ambient occlusion never sees it', () => {
    const ctx = stubContext();

    new FountainJets(options()).init(ctx);

    for (const name of ['fountain-jets', 'fountain-splash']) {
      const material = meshNamed(ctx, name).material as ShaderMaterial;
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.blending).toBe(AdditiveBlending);
    }
  });

  it('spends fewer vertices on the lower tiers', () => {
    const counts = (['low', 'medium', 'high'] as const).map((tier) => {
      const ctx = context(tier);
      new FountainJets(options()).init(ctx);
      return meshNamed(ctx, 'fountain-jets').geometry.getAttribute('position').count;
    });

    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('does nothing on the CPU per frame', () => {
    const ctx = stubContext();
    const jets = new FountainJets(options());
    jets.init(ctx);
    const before = worldVertices(meshNamed(ctx, 'fountain-jets'));

    jets.update();

    expect(worldVertices(meshNamed(ctx, 'fountain-jets'))).toEqual(before);
  });

  it('takes everything back out of the scene when disposed', () => {
    const ctx = stubContext();
    const jets = new FountainJets(options());
    jets.init(ctx);
    const material = meshNamed(ctx, 'fountain-jets').material as ShaderMaterial;
    const disposed = vi.fn();
    material.addEventListener('dispose', disposed);

    jets.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('survives being disposed before init or twice', () => {
    const jets = new FountainJets(options());

    expect(() => {
      jets.dispose();
      jets.init(stubContext());
      jets.dispose();
      jets.dispose();
    }).not.toThrow();
  });
});

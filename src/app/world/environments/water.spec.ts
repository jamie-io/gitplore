import { BufferAttribute, Mesh, PerspectiveCamera, Scene, ShaderMaterial } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { LICHTUNG } from './mood';
import { ATMOSPHERE_FOG_GLSL } from './shaders/atmosphere';
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

/** A stream along x that bends south, 2.5 m either side of its line. */
const PATH: readonly (readonly [number, number])[] = [
  [-20, 4],
  [0, 4],
  [12, 10],
];
const HALF_WIDTH = 2.5;

/** A trough along the stream: 1 m below the water line on the line, rising through it at 2 m. */
const channel = {
  heightAt(x: number, z: number): number {
    const d = distanceToPath(x, z);
    return LEVEL - 1 + 0.25 * d * d;
  },
};

function distanceToPath(x: number, z: number): number {
  let nearest = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return nearest;
}

function stream(shared = new SharedUniforms(LICHTUNG)): WaterOptions {
  return {
    shared,
    mood: LICHTUNG,
    path: PATH,
    halfWidth: HALF_WIDTH,
    level: LEVEL,
    ground: channel,
    colours: { shallow: 0x4f8b93, deep: 0x1f4a45, foam: 0x8cc3c8 },
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

  it("fogs through the atmosphere's own function, so it can never drift from the bank", () => {
    const ctx = stubContext();

    new Water(options()).init(ctx);

    const { fragmentShader } = surface(ctx).material as ShaderMaterial;
    expect(fragmentShader).toContain(ATMOSPHERE_FOG_GLSL);
    expect(fragmentShader).toContain(
      'gl_FragColor.rgb = atmosphereFog(gl_FragColor.rgb, vWorld, sunDirection, sunColor, heightFog);',
    );
    // Fogged after the tone curve and the colour space, exactly where the bank's fog chunk sits.
    expect(fragmentShader.indexOf('gl_FragColor.rgb = atmosphereFog(')).toBeGreaterThan(
      fragmentShader.indexOf('#include <colorspace_fragment>'),
    );
  });

  it('fogs after the colour space only when asked, leaving the other worlds’ ponds as they were', () => {
    const pond = stubContext();
    const jungle = stubContext();
    new Water(options()).init(pond);
    new Water({ ...options(), bankFog: true }).init(jungle);

    const before = surface(pond).material as ShaderMaterial;
    const after = surface(jungle).material as ShaderMaterial;
    expect(before.defines?.['WATER_BANK_FOG']).toBeUndefined();
    expect(after.defines?.['WATER_BANK_FOG']).toBe('');
    // Both orders are in the source; the define picks one, the pond's `#ifndef` branch by default.
    expect(before.fragmentShader).toContain('#ifndef WATER_BANK_FOG');
    expect(before.fragmentShader).toContain(
      'colour = atmosphereFog(colour, vWorld, sunDirection, sunColor, heightFog);',
    );
  });

  it('spends fewer vertices and ripple layers on the lower tiers', () => {
    const low = context('low');
    const medium = context('medium');
    const high = context('high');
    new Water(options()).init(low);
    new Water(options()).init(medium);
    new Water(options()).init(high);

    const lowMesh = surface(low);
    const mediumMesh = surface(medium);
    const highMesh = surface(high);
    expect(lowMesh.geometry.getAttribute('position').count).toBeLessThan(
      mediumMesh.geometry.getAttribute('position').count,
    );
    expect(mediumMesh.geometry.getAttribute('position').count).toBeLessThan(
      highMesh.geometry.getAttribute('position').count,
    );
    expect((lowMesh.material as ShaderMaterial).defines?.['WATER_LAYERS']).toBe(1);
    expect((mediumMesh.material as ShaderMaterial).defines?.['WATER_LAYERS']).toBe(2);
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

  it('lays a stream as a ribbon along its path, in world coordinates at the water level', () => {
    const ctx = stubContext();
    new Water(stream()).init(ctx);
    const mesh = surface(ctx);
    const position = mesh.geometry.getAttribute('position') as BufferAttribute;

    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([0, LEVEL, 0]);
    const ends = [PATH[0], PATH[PATH.length - 1]].map(() => Infinity);
    for (let i = 0; i < position.count; i++) {
      expect(position.getY(i)).toBe(0);
      expect(distanceToPath(position.getX(i), position.getZ(i))).toBeLessThanOrEqual(
        HALF_WIDTH + 1e-6,
      );
      [PATH[0], PATH[PATH.length - 1]].forEach(([x, z], end) => {
        ends[end] = Math.min(ends[end], Math.hypot(position.getX(i) - x, position.getZ(i) - z));
      });
    }
    // It runs the whole path, end to end, with a vertex on the line at either end.
    expect(ends[0]).toBeCloseTo(0, 5);
    expect(ends[1]).toBeCloseTo(0, 5);
  });

  it('bakes the depth over the channel bed into every vertex of a stream', () => {
    const ctx = stubContext();
    new Water(stream()).init(ctx);
    const geometry = surface(ctx).geometry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const depth = geometry.getAttribute('aDepth') as BufferAttribute;

    for (let i = 0; i < position.count; i++) {
      expect(depth.getX(i)).toBeCloseTo(
        LEVEL - channel.heightAt(position.getX(i), position.getZ(i)),
        5,
      );
    }
  });

  it('faces a stream up too', () => {
    const ctx = stubContext();
    new Water(stream()).init(ctx);
    const geometry = surface(ctx).geometry.clone();

    geometry.computeVertexNormals();

    const normal = geometry.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getY(i)).toBeCloseTo(1, 5);
    }
  });

  it('spends fewer vertices on a stream on the lower tiers', () => {
    const counts = (['low', 'medium', 'high'] as const).map((tier) => {
      const ctx = context(tier);
      new Water(stream()).init(ctx);
      return surface(ctx).geometry.getAttribute('position').count;
    });

    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('carries its ripples downstream only when it is given a flow', () => {
    const still = stubContext();
    const flowing = stubContext();
    new Water(options()).init(still);
    new Water({ ...stream(), flow: [-0.5, 0.1] }).init(flowing);

    const pond = surface(still).material as ShaderMaterial;
    const brook = surface(flowing).material as ShaderMaterial;
    expect(pond.defines?.['WATER_FLOW']).toBeUndefined();
    expect(pond.uniforms['flow']).toBeUndefined();
    expect(brook.defines?.['WATER_FLOW']).toBe('');
    expect(brook.uniforms['flow'].value.toArray()).toEqual([-0.5, 0.1]);
    expect(brook.fragmentShader).toContain('p -= flow * time;');
  });

  it('mirrors less of the sky only when told to, leaving a pond’s shader as it was', () => {
    const pond = stubContext();
    const brook = stubContext();
    new Water(options()).init(pond);
    new Water({ ...stream(), reflection: 0.4 }).init(brook);

    expect(
      (surface(pond).material as ShaderMaterial).defines?.['WATER_REFLECTION'],
    ).toBeUndefined();
    const material = surface(brook).material as ShaderMaterial;
    expect(material.defines?.['WATER_REFLECTION']).toBe('0.400');
    expect(material.fragmentShader).toContain('fresnel *= WATER_REFLECTION;');
  });

  it('survives being disposed twice or before init', () => {
    const water = new Water(options());

    expect(() => water.dispose()).not.toThrow();
    water.init(stubContext());
    water.dispose();
    expect(() => water.dispose()).not.toThrow();
  });
});

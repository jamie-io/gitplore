import {
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Vector3,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { GrassField, GrassOptions } from './grass';
import { LICHTUNG } from './mood';
import { Exclusion } from './scatter';
import { SharedUniforms } from './shaders/shared-uniforms';
import { terrainGlsl } from './terrain';

const BARE: readonly Exclusion[] = [
  { kind: 'circle', x: 0, z: 0, radius: 12 },
  { kind: 'circle', x: 0, z: -30, radius: 4 },
  { kind: 'ring', x: 0, z: 0, inner: 28, outer: 32 },
  { kind: 'segment', ax: 0, az: -12, bx: 0, bz: -30, halfWidth: 1.5 },
];

function options(overrides: Partial<GrassOptions> = {}): GrassOptions {
  return {
    shared: new SharedUniforms(LICHTUNG),
    heightGlsl: terrainGlsl(),
    radius: 40,
    blades: 60_000,
    height: 0.5,
    colours: { root: 0x3f6b2a, tip: 0xb8c95a, dry: 0xd2b25a },
    bare: BARE,
    ...overrides,
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

function field(ctx: WorldContext): Mesh<InstancedBufferGeometry, MeshStandardMaterial> {
  const mesh = ctx.scene.getObjectByName('grass');
  if (!(mesh instanceof Mesh)) {
    throw new Error('no grass in the scene');
  }
  return mesh as Mesh<InstancedBufferGeometry, MeshStandardMaterial>;
}

function compile(material: MeshStandardMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
    defines: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

function circles(n: number): { x: number; z: number; radius: number }[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 10, z: 0, radius: 2 }));
}

describe('GrassField', () => {
  it('adds exactly one instanced mesh to the scene', () => {
    const ctx = stubContext();

    new GrassField(options()).init(ctx);

    expect(ctx.scene.children).toHaveLength(1);
    expect(field(ctx).geometry).toBeInstanceOf(InstancedBufferGeometry);
  });

  it('draws a whole grid of blades, more on every tier up', () => {
    const counts = (['low', 'medium', 'high'] as const).map((tier) => {
      const ctx = context(tier);
      new GrassField(options()).init(ctx);
      return field(ctx).geometry.instanceCount;
    });

    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    for (const count of counts) {
      expect(Math.sqrt(count) % 1).toBe(0);
    }
    // Each instance is a tuft of 64 blades; the high tier draws at least what was asked for.
    expect(counts[2] * 64).toBeGreaterThanOrEqual(60_000);
    expect(counts[2] * 64).toBeLessThan(60_000 * 1.5);
  });

  it('is never frustum culled, because the blades only exist in the shader', () => {
    const ctx = stubContext();

    new GrassField(options()).init(ctx);

    expect(field(ctx).frustumCulled).toBe(false);
  });

  it('uploads one tuft of 64 blades, seven vertices and five triangles each, plus a cell per instance', () => {
    const ctx = stubContext();
    new GrassField(options()).init(ctx);
    const geometry = field(ctx).geometry;

    expect(geometry.getAttribute('position').count).toBe(64 * 7);
    expect(geometry.getIndex()?.count).toBe(64 * 15);
    const blades = geometry.getAttribute('aBlade');
    expect(blades.count).toBe(64 * 7);
    // The last blade sits in the far corner of the 8 × 8 tuft, and all seven of its vertices agree.
    for (let v = 63 * 7; v < 64 * 7; v++) {
      expect(blades.getX(v)).toBe(7);
      expect(blades.getY(v)).toBe(7);
    }
    const cells = geometry.getAttribute('aCell');
    expect(cells.itemSize).toBe(3);
    expect(cells.count).toBe(geometry.instanceCount);
    const side = Math.sqrt(geometry.instanceCount);
    expect(cells.getX(cells.count - 1)).toBe(side - 1);
    expect(cells.getY(cells.count - 1)).toBe(side - 1);
  });

  it('refuses a seventeenth circle, clearings included', () => {
    const grass = new GrassField(options());

    expect(() => grass.setClearings(circles(14))).not.toThrow();
    expect(() => grass.setClearings(circles(15))).toThrow(RangeError);
    expect(() => grass.setClearings(circles(15))).toThrow(/16/);
  });

  it('refuses too many of each other kind in the constructor', () => {
    const rings = Array.from({ length: 5 }, () => BARE[2]);
    const segments = Array.from({ length: 9 }, () => BARE[3]);
    const arcs = Array.from({ length: 5 }, () => ({
      kind: 'arc' as const,
      x: 0,
      z: 0,
      radius: 30,
      halfWidth: 2,
      from: -1,
      to: 1,
    }));

    expect(() => new GrassField(options({ bare: rings }))).toThrow(/4 ring/);
    expect(() => new GrassField(options({ bare: segments }))).toThrow(/8 segment/);
    expect(() => new GrassField(options({ bare: arcs }))).toThrow(/4 arc/);
    expect(() => new GrassField(options({ bare: [] }))).not.toThrow();
  });

  it('hands the bare zones and clearings to the shader as uniforms', () => {
    const ctx = stubContext();
    const grass = new GrassField(options());
    grass.setClearings(circles(3));
    grass.init(ctx);

    const { uniforms } = compile(field(ctx).material);

    expect(uniforms['grassCircleCount'].value).toBe(2 + 3);
    expect(uniforms['grassRingCount'].value).toBe(1);
    expect(uniforms['grassSegmentCount'].value).toBe(1);
    expect(uniforms['grassArcCount'].value).toBe(0);
    expect(uniforms['grassCircles'].value).toHaveLength(16);
    expect(uniforms['grassCircles'].value[1]).toEqual(new Vector3(0, -30, 4));
    expect(uniforms['grassCircles'].value[4]).toEqual(new Vector3(20, 0, 2));
  });

  it('stands the blades on the ground GLSL it was given and wraps them around the camera', () => {
    const ctx = stubContext();
    new GrassField(options()).init(ctx);

    const shader = compile(field(ctx).material);

    expect(shader.vertexShader).toContain('float terrainHeight(vec2 p)');
    expect(shader.vertexShader).toContain('terrainHeight(base)');
    expect(shader.vertexShader).toContain('mod(aCell.xy - origin, side)');
    expect(shader.vertexShader).toContain('windGust(base, grassWind, grassTime)');
    expect(shader.vertexShader).toContain('grassPlayer');
    expect(shader.fragmentShader).toContain('vGrassColour');
    expect(shader.fragmentShader).toContain('atmosHeightFog');
  });

  it('shares the world clock, wind, sun and player by identity', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const ctx = stubContext();
    new GrassField(options({ shared })).init(ctx);

    const { uniforms } = compile(field(ctx).material);

    expect(uniforms['grassTime']).toBe(shared.time);
    expect(uniforms['grassWind']).toBe(shared.wind);
    expect(uniforms['grassPlayer']).toBe(shared.playerPosition);
    expect(uniforms['grassSunDirection']).toBe(shared.sunDirection);
    expect(uniforms['grassSunColor']).toBe(shared.sunColor);
  });

  it('receives shadows only where the tier casts them', () => {
    const low = context('low');
    const high = context('high');
    new GrassField(options()).init(low);
    new GrassField(options()).init(high);

    expect(field(low).receiveShadow).toBe(false);
    expect(field(low).castShadow).toBe(false);
    expect(field(high).receiveShadow).toBe(true);
    expect(field(high).castShadow).toBe(false);
  });

  it('keys the program on the ground GLSL, so two grounds never share a program', () => {
    const one = stubContext();
    const two = stubContext();
    new GrassField(options()).init(one);
    new GrassField(options({ heightGlsl: 'float terrainHeight(vec2 p) { return 0.0; }' })).init(
      two,
    );

    expect(field(one).material.customProgramCacheKey()).not.toBe(
      field(two).material.customProgramCacheKey(),
    );
  });

  it('takes itself back out of the scene when disposed', () => {
    const ctx = stubContext();
    const grass = new GrassField(options());
    grass.init(ctx);
    const disposed = vi.fn();
    field(ctx).geometry.addEventListener('dispose', disposed);

    grass.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('survives being disposed twice or before init', () => {
    const grass = new GrassField(options());

    expect(() => grass.dispose()).not.toThrow();
    grass.init(stubContext());
    grass.dispose();
    expect(() => grass.dispose()).not.toThrow();
  });
});

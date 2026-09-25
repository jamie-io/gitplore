import { Color, Mesh, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { DSCHUNGEL } from './mood';
import { jungleHeightAt } from './jungle-layout';
import { ATMOSPHERE_FOG_GLSL } from './shaders/atmosphere';
import { GroundHaze } from './shaders/ground-haze';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Waterfall, WaterfallOptions } from './waterfall';

const LIP: readonly [number, number, number] = [9, 12.6, -50];
const DROP = 13.1;

function options(
  shared = new SharedUniforms(DSCHUNGEL),
  overrides: Partial<WaterfallOptions> = {},
): WaterfallOptions {
  return {
    shared,
    mood: DSCHUNGEL,
    lip: LIP,
    width: 4.5,
    drop: DROP,
    rotationY: 0,
    colours: { water: 0xcfeee6, foam: 0xffffff },
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

function sheetIn(ctx: WorldContext): Mesh {
  const mesh = ctx.scene.getObjectByName('waterfall-sheet');
  if (!(mesh instanceof Mesh)) {
    throw new Error('no waterfall sheet in the scene');
  }
  return mesh;
}

function foamIn(ctx: WorldContext): Mesh {
  const mesh = ctx.scene.getObjectByName('waterfall-foam');
  if (!(mesh instanceof Mesh)) {
    throw new Error('no foam in the scene');
  }
  return mesh;
}

/** Every vertex of `mesh` in world space. */
function worldVertices(mesh: Mesh): Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  const vertices: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    vertices.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  return vertices;
}

describe('Waterfall', () => {
  it('pours from the lip down to the pool', () => {
    const ctx = stubContext();

    new Waterfall(options()).init(ctx);

    const heights = worldVertices(sheetIn(ctx)).map((v) => v.y);
    expect(Math.max(...heights)).toBeCloseTo(LIP[1], 1);
    expect(Math.abs(Math.max(...heights) - LIP[1])).toBeLessThanOrEqual(0.05);
    expect(Math.abs(Math.min(...heights) - (LIP[1] - DROP))).toBeLessThanOrEqual(0.3);
  });

  it('leans out from the rock before it falls, in the direction it was turned', () => {
    const towardsZ = stubContext();
    const towardsX = stubContext();
    new Waterfall(options()).init(towardsZ);
    new Waterfall(options(undefined, { rotationY: Math.PI / 2 })).init(towardsX);

    const bottomZ = worldVertices(sheetIn(towardsZ)).filter((v) => v.y < LIP[1] - DROP + 0.5);
    const bottomX = worldVertices(sheetIn(towardsX)).filter((v) => v.y < LIP[1] - DROP + 0.5);
    for (const v of bottomZ) {
      expect(v.z).toBeGreaterThan(LIP[2] + 0.8);
      expect(Math.abs(v.x - LIP[0])).toBeLessThanOrEqual(2.25 + 1e-6);
    }
    for (const v of bottomX) {
      expect(v.x).toBeGreaterThan(LIP[0] + 0.8);
      expect(Math.abs(v.z - LIP[2])).toBeLessThanOrEqual(2.25 + 1e-6);
    }
    // The landing point lies within the pool the sheet was given, never out past its far shore.
    expect(Math.max(...bottomZ.map((v) => v.z))).toBeLessThan(LIP[2] + 4);
  });

  it('spans the width it was given at the lip', () => {
    const ctx = stubContext();

    new Waterfall(options()).init(ctx);

    const top = worldVertices(sheetIn(ctx)).filter((v) => v.y > LIP[1] - 0.05);
    expect(Math.max(...top.map((v) => v.x)) - Math.min(...top.map((v) => v.x))).toBeCloseTo(4.5, 5);
  });

  it('foams where the water lands and hangs mist over it', () => {
    const ctx = stubContext();

    new Waterfall(options()).init(ctx);

    const foam = foamIn(ctx);
    foam.updateWorldMatrix(true, false);
    const at = new Vector3().setFromMatrixPosition(foam.matrixWorld);
    const bottom = worldVertices(sheetIn(ctx)).filter((v) => v.y < LIP[1] - DROP + 0.1);
    const landingZ = bottom.reduce((sum, v) => sum + v.z, 0) / bottom.length;
    expect(at.y).toBeCloseTo(LIP[1] - DROP, 1);
    expect(at.x).toBeCloseTo(LIP[0], 5);
    expect(at.z).toBeCloseTo(landingZ, 1);

    const mist = ctx.scene.children.find((child): child is Points => child instanceof Points);
    expect(mist).toBeDefined();
    const positions = mist?.geometry.getAttribute('position');
    expect(positions?.count).toBeGreaterThan(0);
    for (let i = 0; i < (positions?.count ?? 0); i++) {
      expect(Math.hypot(positions!.getX(i) - LIP[0], positions!.getZ(i) - landingZ)).toBeLessThan(
        4.5,
      );
      expect(positions!.getY(i)).toBeGreaterThan(LIP[1] - DROP - 0.5);
      expect(positions!.getY(i)).toBeLessThan(LIP[1] - DROP + 3.5);
    }
  });

  it('shares the world clock and sun by identity, so reduced motion freezes all of it', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const ctx = stubContext();

    new Waterfall(options(shared)).init(ctx);

    for (const mesh of [sheetIn(ctx), foamIn(ctx)]) {
      const { uniforms } = mesh.material as ShaderMaterial;
      expect(uniforms['time']).toBe(shared.time);
      expect(uniforms['sunDirection']).toBe(shared.sunDirection);
      expect(uniforms['sunColor']).toBe(shared.sunColor);
      expect(uniforms['heightFog']).toBe(shared.heightFog);
    }
    const mist = ctx.scene.children.find((child): child is Points => child instanceof Points);
    expect((mist?.material as ShaderMaterial).uniforms['time']).toBe(shared.time);
  });

  it('fogs through the atmosphere, so the falls sit in the same haze as the cliff', () => {
    const ctx = stubContext();

    new Waterfall(options()).init(ctx);

    for (const mesh of [sheetIn(ctx), foamIn(ctx)]) {
      const material = mesh.material as ShaderMaterial;
      expect(material.fog).toBe(true);
      expect(material.fragmentShader).toContain(ATMOSPHERE_FOG_GLSL);
      expect(material.uniforms['fogColor']).toBeDefined();
      expect(material.uniforms['fogNear']).toBeDefined();
      expect(material.uniforms['fogFar']).toBeDefined();
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
  });

  it('stands its foot in the ground haze where the world has one, in linear light', () => {
    const haze = new GroundHaze({
      heightAt: jungleHeightAt,
      clearing: { origin: { value: new Vector3() }, radius: { value: 0 } },
    });
    const hazed = stubContext();
    const plain = stubContext();
    new Waterfall(options(new SharedUniforms(DSCHUNGEL, { groundHaze: haze }))).init(hazed);
    new Waterfall(options()).init(plain);

    for (const mesh of [sheetIn(hazed), foamIn(hazed)]) {
      const material = mesh.material as ShaderMaterial;
      expect(material.defines['GROUND_HAZE']).toBe('');
      expect(material.defines['HAZE_LINEAR']).toBe('');
      expect(material.uniforms['uHazeAmount']).toBe(haze.uniforms.uHazeAmount);
    }
    for (const mesh of [sheetIn(plain), foamIn(plain)]) {
      expect((mesh.material as ShaderMaterial).defines['GROUND_HAZE']).toBeUndefined();
    }
    haze.dispose();
  });

  it('spends fewer rows and noise layers on the low tier', () => {
    const low = context('low');
    const high = context('high');
    new Waterfall(options()).init(low);
    new Waterfall(options()).init(high);

    expect(sheetIn(low).geometry.getAttribute('position').count).toBeLessThan(
      sheetIn(high).geometry.getAttribute('position').count,
    );
    expect((sheetIn(low).material as ShaderMaterial).defines?.['FALL_LAYERS']).toBe(1);
    expect((sheetIn(high).material as ShaderMaterial).defines?.['FALL_LAYERS']).toBe(2);
  });

  it('follows a tier change under a running world: glints for the bloom, mist for the blend', () => {
    const medium = context('medium');
    const high = { ...medium, quality: qualitySettings('high') };
    const waterfall = new Waterfall(options());
    waterfall.init(medium);
    const highlight = (sheetIn(medium).material as ShaderMaterial).uniforms['highlight'];
    const mistGlow = () => {
      const mist = medium.scene.children.filter(
        (child): child is Points => child instanceof Points,
      );
      expect(mist).toHaveLength(1);
      return (mist[0].material as ShaderMaterial).uniforms['glow'].value as number;
    };
    const direct = { highlight: highlight.value as number, glow: mistGlow() };

    waterfall.update(0.016, high);

    expect(highlight.value).toBeGreaterThan(1);
    expect(direct.highlight).toBeLessThan(1);
    // Without the post stack the points are encoded before they are added, so they must be fainter.
    expect(mistGlow()).toBeGreaterThan(direct.glow);

    waterfall.update(0.016, medium);

    expect(highlight.value).toBe(direct.highlight);
    expect(mistGlow()).toBe(direct.glow);
  });

  it("tints the glassy water with the mood's horizon", () => {
    const ctx = stubContext();

    new Waterfall(options()).init(ctx);

    const { uniforms } = sheetIn(ctx).material as ShaderMaterial;
    expect(uniforms['skyColor'].value.getHex()).toBe(new Color(DSCHUNGEL.sky.horizon).getHex());
  });

  it('takes everything back out of the scene when disposed', () => {
    const ctx = stubContext();
    const waterfall = new Waterfall(options());
    waterfall.init(ctx);
    const materials = [sheetIn(ctx).material, foamIn(ctx).material] as ShaderMaterial[];
    const disposed = materials.map((material) => vi.spyOn(material, 'dispose'));

    waterfall.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    for (const spy of disposed) {
      expect(spy).toHaveBeenCalledOnce();
    }
  });

  it('survives being disposed twice or before init', () => {
    const waterfall = new Waterfall(options());

    expect(() => waterfall.dispose()).not.toThrow();
    waterfall.init(stubContext());
    waterfall.dispose();
    expect(() => waterfall.dispose()).not.toThrow();
  });
});

import {
  DataUtils,
  HalfFloatType,
  LinearFilter,
  MeshStandardMaterial,
  RedFormat,
  ShaderLib,
  Vector3,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { BOWL, jungleHeightAt } from '../jungle-layout';
import { DSCHUNGEL } from '../mood';
import { withAtmosphere } from './atmosphere';
import {
  GROUND_HAZE,
  GroundHaze,
  HazeClearing,
  bakeHazeGround,
  groundHazeProgram,
  hazeDensity,
  hazeMask,
} from './ground-haze';
import { HazedCopies } from './hazed-copies';
import { SharedUniforms } from './shared-uniforms';

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

function clearingUniforms() {
  return { origin: { value: new Vector3() }, radius: { value: 0 } };
}

/** Nothing clears: the lantern unlit, no ring running. */
const DARK: HazeClearing = {
  light: { x: 0, z: 0, radius: 0 },
  ring: { x: 0, z: 0, radius: 0 },
};

describe('hazeDensity', () => {
  it('is 1 on the ground, thins monotonically with height and is gone by 2.2 m', () => {
    expect(hazeDensity(0)).toBe(1);
    let previous = hazeDensity(0);
    for (let height = 0.1; height < GROUND_HAZE.top; height += 0.1) {
      const density = hazeDensity(height);
      expect(density).toBeLessThan(previous);
      expect(density).toBeGreaterThan(0);
      previous = density;
    }
    expect(GROUND_HAZE.top).toBe(2.2);
    expect(hazeDensity(2.2)).toBe(0);
    expect(hazeDensity(3)).toBe(0);
    expect(hazeDensity(40)).toBe(0);
  });

  it('stays full under the ground, where a filtered height can put a sample', () => {
    expect(hazeDensity(-0.3)).toBe(1);
  });
});

describe('hazeMask', () => {
  it('is 0 outside the bowl and 1 in the slop inside it', () => {
    expect(hazeMask(BOWL.rx + 1, 0, DARK)).toBe(0);
    expect(hazeMask(0, -BOWL.rz - 0.5, DARK)).toBe(0);
    expect(hazeMask(30, 30, DARK)).toBe(0);
    expect(hazeMask(0, 10, DARK)).toBe(1);
    expect(hazeMask(-12, -8, DARK)).toBe(1);
  });

  it('is clear within 0.7 R of the lit lantern and whole again from R', () => {
    const lit: HazeClearing = { ...DARK, light: { x: -2, z: 12, radius: 8 } };

    expect(hazeMask(-2, 12, lit)).toBe(0);
    expect(hazeMask(-2 + 0.7 * 8 - 0.01, 12, lit)).toBe(0);
    const between = hazeMask(-2 + 0.85 * 8, 12, lit);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
    expect(hazeMask(-2, 12 - 8, lit)).toBe(1);
    expect(hazeMask(-2 + 10, 12, lit)).toBe(1);
  });

  it('is clear inside the ring and whole again 4 m beyond it', () => {
    const ring: HazeClearing = { ...DARK, ring: { x: 0, z: 0, radius: 6 } };

    expect(hazeMask(0, 3, ring)).toBe(0);
    expect(hazeMask(6, 0, ring)).toBe(0);
    const between = hazeMask(8, 0, ring);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
    expect(hazeMask(0, 10, ring)).toBe(1);
    expect(hazeMask(-12, 0, ring)).toBe(1);
  });

  it('clears nothing at an unlit lantern or before the ring starts', () => {
    const idle: HazeClearing = {
      light: { x: 0, z: 10, radius: 0 },
      ring: { x: 0, z: 10, radius: 0 },
    };

    expect(hazeMask(0, 10, idle)).toBe(1);
    expect(hazeMask(0.5, 10, idle)).toBe(1);
  });

  it('keeps the clearer of the lantern and the ring', () => {
    const both: HazeClearing = {
      light: { x: 0, z: 10, radius: 8 },
      ring: { x: 0, z: 0, radius: 6 },
    };

    expect(hazeMask(0, 10, both)).toBe(0);
    expect(hazeMask(0, 2, both)).toBe(0);
  });
});

describe('bakeHazeGround', () => {
  it('bakes the ground under the bowl and its rim into a filtered half-float texture', () => {
    const bake = bakeHazeGround(jungleHeightAt);
    const { texture, rect } = bake;

    expect(texture.image.width).toBe(128);
    expect(texture.image.height).toBe(96);
    expect(texture.type).toBe(HalfFloatType);
    expect(texture.format).toBe(RedFormat);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(rect.minX).toBeLessThan(-BOWL.rx);
    expect(rect.minZ).toBeLessThan(-BOWL.rz);
    expect(rect.minX + rect.width).toBeGreaterThan(BOWL.rx);
    expect(rect.minZ + rect.depth).toBeGreaterThan(BOWL.rz);
    texture.dispose();
  });

  it('round-trips the heights within 5 cm', () => {
    const { texture, rect } = bakeHazeGround(jungleHeightAt);
    const { data, width, height } = texture.image as {
      data: Uint16Array;
      width: number;
      height: number;
    };

    let worst = 0;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const x = rect.minX + ((col + 0.5) / width) * rect.width;
        const z = rect.minZ + ((row + 0.5) / height) * rect.depth;
        const baked = DataUtils.fromHalfFloat(data[row * width + col]);
        worst = Math.max(worst, Math.abs(baked - jungleHeightAt(x, z)));
      }
    }
    expect(worst).toBeLessThan(0.05);
    texture.dispose();
  });

  it('bounds the haze with a box from the lowest ground in the bowl to 2.2 m over its highest', () => {
    const { floor, ceiling, texture } = bakeHazeGround(jungleHeightAt);

    expect(floor).toBeLessThanOrEqual(jungleHeightAt(0, 0));
    for (const [x, z] of [
      [0, 18],
      [0, 10],
      [-10, -10],
    ]) {
      expect(ceiling).toBeGreaterThanOrEqual(jungleHeightAt(x, z) + GROUND_HAZE.top);
    }
    expect(ceiling).toBeLessThan(10);
    texture.dispose();
  });
});

describe('GroundHaze', () => {
  it('shares the clearing uniforms by identity with whoever drives the ring', () => {
    const clearing = clearingUniforms();
    const haze = new GroundHaze({ heightAt: jungleHeightAt, clearing });

    expect(haze.uniforms.uHazeClearOrigin).toBe(clearing.origin);
    expect(haze.uniforms.uHazeClearRadius).toBe(clearing.radius);
    haze.dispose();
  });

  it('writes the lantern light as (x, z, radius) and clamps the amount to 0 … 1', () => {
    const haze = new GroundHaze({ heightAt: jungleHeightAt, clearing: clearingUniforms() });

    haze.setLight(-2, 12, 8);
    expect(haze.uniforms.uHazeLight.value.toArray()).toEqual([-2, 12, 8]);
    haze.setLight(-2, 12, -1);
    expect(haze.uniforms.uHazeLight.value.z).toBe(0);

    expect(haze.uniforms.uHazeAmount.value).toBe(1);
    haze.setAmount(0.4);
    expect(haze.uniforms.uHazeAmount.value).toBe(0.4);
    haze.setAmount(3);
    expect(haze.uniforms.uHazeAmount.value).toBe(1);
    haze.setAmount(-1);
    expect(haze.uniforms.uHazeAmount.value).toBe(0);
    haze.dispose();
  });

  it('marches 4 steps on the low tier, 10 on medium and 16 on high', () => {
    const haze = new GroundHaze({ heightAt: jungleHeightAt, clearing: clearingUniforms() });

    expect(haze.steps).toBe(4);
    haze.setDetail(1);
    expect(haze.steps).toBe(10);
    haze.setDetail(2);
    expect(haze.steps).toBe(16);
    haze.setDetail(0);
    expect(haze.steps).toBe(4);
    haze.dispose();
  });

  it('hands a ShaderMaterial its defines and uniforms, and nothing without a haze', () => {
    const haze = new GroundHaze({ heightAt: jungleHeightAt, clearing: clearingUniforms() });
    haze.setDetail(1);

    const program = groundHazeProgram(haze);
    expect(program.defines).toEqual({ GROUND_HAZE: '', HAZE_STEPS: 10 });
    expect(program.uniforms['uHazeLight']).toBe(haze.uniforms.uHazeLight);
    expect(program.uniforms['uHazeGround']).toBe(haze.uniforms.uHazeGround);
    // A material that fogs before its tone mapping takes the violet in linear light.
    expect(groundHazeProgram(haze, { linear: true }).defines).toEqual({
      GROUND_HAZE: '',
      HAZE_STEPS: 10,
      HAZE_LINEAR: '',
    });

    expect(groundHazeProgram(null)).toEqual({ defines: {}, uniforms: {} });
    haze.dispose();
  });
});

describe('the atmosphere with a ground haze', () => {
  function hazed() {
    const haze = new GroundHaze({ heightAt: jungleHeightAt, clearing: clearingUniforms() });
    return { haze, shared: new SharedUniforms(DSCHUNGEL, { groundHaze: haze }) };
  }

  it('adds the haze term to the shared atmosphere, with the tier’s step count', () => {
    const { haze, shared } = hazed();
    haze.setDetail(2);
    const shader = compile(withAtmosphere(new MeshStandardMaterial(), shared));

    expect(shader.fragmentShader).toContain('#define GROUND_HAZE');
    expect(shader.fragmentShader).toContain('#define HAZE_STEPS 16');
    expect(shader.fragmentShader).toContain('groundHaze(');
    expect(shader.uniforms['uHazeLight']).toBe(haze.uniforms.uHazeLight);
    expect(shader.uniforms['uHazeAmount']).toBe(haze.uniforms.uHazeAmount);
    expect(shader.uniforms['uHazeClearOrigin']).toBe(haze.uniforms.uHazeClearOrigin);
    haze.dispose();
  });

  it('keys the program on the haze and its step count, so tiers never share one', () => {
    const { haze, shared } = hazed();
    const plain = withAtmosphere(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL));
    const material = withAtmosphere(new MeshStandardMaterial(), shared);

    haze.setDetail(0);
    const low = material.customProgramCacheKey();
    haze.setDetail(2);
    const high = material.customProgramCacheKey();

    expect(low).not.toBe(plain.customProgramCacheKey());
    expect(high).not.toBe(low);
    haze.dispose();
  });

  it('leaves a world without a haze exactly as it was', () => {
    const shader = compile(
      withAtmosphere(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL)),
    );

    expect(shader.fragmentShader).not.toContain('#define GROUND_HAZE');
    expect(shader.uniforms['uHazeLight']).toBeUndefined();
  });

  it('reaches loaded models through their hazed copies', () => {
    const { haze, shared } = hazed();
    const copies = new HazedCopies(shared);
    const copy = copies.of(new MeshStandardMaterial()) as MeshStandardMaterial;

    const shader = compile(copy);
    expect(shader.fragmentShader).toContain('#define GROUND_HAZE');
    expect(shader.uniforms['uHazeLight']).toBe(haze.uniforms.uHazeLight);
    copies.dispose();
    haze.dispose();
  });
});

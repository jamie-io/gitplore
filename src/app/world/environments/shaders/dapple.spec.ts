import {
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { DSCHUNGEL } from '../mood';
import { withAtmosphere } from './atmosphere';
import { withDapple } from './dapple';
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

describe('withDapple', () => {
  it('multiplies the direct light, not the albedo, so dapples vanish inside a shadow', () => {
    const shader = compile(
      withDapple(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), 0.6),
    );

    expect(shader.fragmentShader).toContain('float dappleLight(');
    expect(shader.fragmentShader).toContain('directLight.color *= dappleFactor;');
    // The whole light loop is inlined so the factor can be applied, but Three's own chunk text
    // stays: every light type still goes through `RE_Direct`.
    expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('RE_Direct( directLight');
    expect(shader.fragmentShader).not.toContain('diffuseColor.rgb *= dapple');
  });

  it('projects the noise along the sun direction and drifts it on the shared clock', () => {
    const shader = compile(
      withDapple(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), 0.6),
    );

    expect(shader.fragmentShader).toContain(
      'dappleLight(vDappleWorld, dappleSunDirection, dappleTime)',
    );
    expect(shader.fragmentShader).toContain('sunDirection.xz');
    expect(shader.fragmentShader).toContain('dappleTime');
    expect(shader.vertexShader).toContain('vDappleWorld = ');
    expect(shader.fragmentShader).toContain('varying vec3 vDappleWorld;');
  });

  it('spends one noise look-up on the tier without shadow maps and none without a sun', () => {
    const shader = compile(
      withDapple(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), 0.6),
    );
    const body = shader.fragmentShader.slice(shader.fragmentShader.indexOf('float dappleLight('));
    const lowTier = body.slice(body.indexOf('#else'), body.indexOf('#endif'));

    expect(body).toContain('#ifdef USE_SHADOWMAP');
    expect(lowTier.match(/noise2\(/g)).toBeNull();
    expect(shader.fragmentShader).toContain(
      '#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n  // No sun-like light',
    );
  });

  it('compiles to exactly the unpatched output at strength 0', () => {
    const material = withDapple(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), 0);
    const shader = compile(material);

    expect(shader.vertexShader).toBe(ShaderLib.standard.vertexShader);
    expect(shader.fragmentShader).toBe(ShaderLib.standard.fragmentShader);
    expect(shader.uniforms).toEqual({});
    expect(material.customProgramCacheKey()).toBe(
      new MeshStandardMaterial().customProgramCacheKey(),
    );
  });

  it('binds the shared sun and clock by identity, so one update reaches every material', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const shader = compile(withDapple(new MeshStandardMaterial(), shared, 0.6));

    expect(shader.uniforms['dappleSunDirection']).toBe(shared.sunDirection);
    expect(shader.uniforms['dappleTime']).toBe(shared.time);
    expect(shader.uniforms['dappleStrength'].value).toBe(0.6);
  });

  it('composes with the atmosphere in either order', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const dappleFirst = withAtmosphere(withDapple(new MeshStandardMaterial(), shared, 0.6), shared);
    const atmosphereFirst = withDapple(
      withAtmosphere(new MeshStandardMaterial(), shared),
      shared,
      0.6,
    );

    for (const material of [dappleFirst, atmosphereFirst]) {
      const shader = compile(material);
      expect(shader.vertexShader).toContain('vDappleWorld = ');
      expect(shader.vertexShader).toContain('vAtmosWorld = ');
      expect(shader.vertexShader.match(/#include <common>/g)).toHaveLength(1);
      expect(shader.vertexShader.match(/#include <project_vertex>/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/#define GITPLORE_NOISE/g)).toHaveLength(1);
      expect(shader.uniforms['dappleTime']).toBe(shared.time);
      expect(shader.uniforms['atmosHeightFog']).toBe(shared.heightFog);
    }
  });

  it('gives the patched material a program cache key of its own', () => {
    const plain = new MeshStandardMaterial();
    const dappled = withDapple(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), 0.6);

    expect(dappled.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(dappled.customProgramCacheKey()).toContain('dapple');
  });

  it('returns the material it patched', () => {
    const material = new MeshStandardMaterial();

    expect(withDapple(material, new SharedUniforms(DSCHUNGEL), 0.6)).toBe(material);
  });
});

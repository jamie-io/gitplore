import {
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { DSCHUNGEL } from '../mood';
import { withAtmosphere } from './atmosphere';
import { withFoliage } from './foliage';
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

describe('withFoliage', () => {
  it('sways each cluster from its root with the two wind terms, weighted by height squared', () => {
    const shader = compile(
      withFoliage(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), {
        push: 1,
        translucency: 0,
      }),
    );

    expect(shader.vertexShader).toContain(
      'sin(foliageTime * 1.25 + foliageRoot.x * 0.6 + foliageRoot.z * 0.45)',
    );
    expect(shader.vertexShader).toContain('sin(foliageTime * 3.3 + foliageRoot.z * 2.1) * 0.012');
    expect(shader.vertexShader).toContain('foliageHeight * foliageHeight');
    expect(shader.vertexShader).toContain('instanceMatrix');
  });

  it('bends away from the visitor within 1.4 m, scaled by its push', () => {
    const shader = compile(
      withFoliage(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), {
        push: 1,
        translucency: 0,
      }),
    );

    expect(shader.vertexShader).toContain('1.0 - smoothstep(0.15, 1.4, foliageDistance)');
    expect(shader.vertexShader).toContain('foliageHeight * 0.5 * foliagePush');
    expect(shader.uniforms['foliagePush'].value).toBe(1);
  });

  it('moves `transformed` in place, so shadows, fog and dapples see the swayed leaf', () => {
    const shader = compile(
      withFoliage(new MeshStandardMaterial(), new SharedUniforms(DSCHUNGEL), {
        push: 0,
        translucency: 0,
      }),
    );

    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    expect(shader.vertexShader).toContain('#include <project_vertex>');
    expect(shader.vertexShader).toContain('transformed += foliageToLocal(');
  });

  it('binds the clock, the visitor and the sun by identity, so nothing is copied per frame', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const shader = compile(
      withFoliage(new MeshStandardMaterial(), shared, { push: 1, translucency: 1.1 }),
    );

    expect(shader.uniforms['foliageTime']).toBe(shared.time);
    expect(shader.uniforms['foliagePlayer']).toBe(shared.playerPosition);
    expect(shader.uniforms['foliageSunDirection']).toBe(shared.sunDirection);
    expect(shader.uniforms['foliageSunColor']).toBe(shared.sunColor);
  });

  it('lights leaves from behind when the sun shines through them, on the stronger tiers only', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const opaque = compile(
      withFoliage(new MeshStandardMaterial(), shared, { push: 1, translucency: 0 }),
    );
    const lit = compile(
      withFoliage(new MeshStandardMaterial(), shared, { push: 1, translucency: 0.7 }),
    );

    expect(opaque.fragmentShader).toBe(ShaderLib.standard.fragmentShader);
    expect(lit.fragmentShader).toContain('totalEmissiveRadiance +=');
    expect(lit.fragmentShader).toContain(
      'pow(max(dot(normalize(-vViewPosition), foliageSunView), 0.0), 3.0)',
    );
    expect(lit.uniforms['foliageTranslucency'].value).toBe(0.7);
  });

  it('keys the translucent and the opaque program apart, but not the push', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const key = (push: number, translucency: number) =>
      withFoliage(new MeshStandardMaterial(), shared, {
        push,
        translucency,
      }).customProgramCacheKey();

    expect(key(1, 0)).not.toBe(key(1, 0.7));
    expect(key(1, 0.7)).toBe(key(0, 1.1));
  });

  it('needs no screen-space derivatives and composes with the atmosphere', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const shader = compile(
      withFoliage(withAtmosphere(new MeshStandardMaterial(), shared), shared, {
        push: 1,
        translucency: 1.1,
      }),
    );

    expect(shader.fragmentShader).not.toMatch(/dFdx|dFdy|fwidth/);
    expect(shader.vertexShader).toContain('vAtmosWorld = ');
    expect(shader.vertexShader.match(/#include <common>/g)).toHaveLength(1);
  });
});

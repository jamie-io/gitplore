import {
  MeshStandardMaterial,
  ShaderLib,
  Vector2,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { LICHTUNG } from '../mood';
import { withAtmosphere } from './atmosphere';
import { SharedUniforms } from './shared-uniforms';
import { withWind } from './wind';

const OPTIONS = { amplitude: 0.35, height: 6 };

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

describe('withWind', () => {
  it('sways the vertices in the vertex shader', () => {
    const shader = compile(
      withWind(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG), OPTIONS),
    );

    expect(shader.vertexShader).toContain('float windGust(');
    expect(shader.vertexShader).toContain('windToLocal(');
    expect(shader.vertexShader).toContain('transformed +=');
    // The sway still starts from Three's own `transformed`, so morph and skin chunks keep working.
    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    expect(shader.fragmentShader).toBe(ShaderLib.standard.fragmentShader);
  });

  it('weights the sway by height squared and phases it from the world origin', () => {
    const shader = compile(
      withWind(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG), OPTIONS),
    );

    expect(shader.vertexShader).toContain('pow(clamp(position.y / windSway.y, 0.0, 1.0), 2.0)');
    expect(shader.vertexShader).toContain('instanceMatrix[3].xyz');
    expect(shader.vertexShader).toContain('modelMatrix[3].xyz');
  });

  it('binds the shared wind and clock by identity, so one update reaches every material', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const shader = compile(withWind(new MeshStandardMaterial(), shared, OPTIONS));

    expect(shader.uniforms['windParams']).toBe(shared.wind);
    expect(shader.uniforms['windTime']).toBe(shared.time);
  });

  it('carries the options as uniforms, never defines, so every height shares one program', () => {
    const material = withWind(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG), OPTIONS);
    const shader = compile(material);

    expect(shader.uniforms['windSway'].value).toEqual(new Vector2(0.35, 6));
    expect(shader.defines).toEqual({});
    expect(material.defines).toEqual(new MeshStandardMaterial().defines);
    expect(shader.vertexShader).not.toMatch(/#define\s+WIND/);
  });

  it('gives the patched material a program cache key of its own', () => {
    const plain = new MeshStandardMaterial();
    const windy = withWind(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG), OPTIONS);

    expect(windy.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(windy.customProgramCacheKey()).toContain('wind');
  });

  it('composes with the atmosphere in either order', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const windFirst = withAtmosphere(withWind(new MeshStandardMaterial(), shared, OPTIONS), shared);
    const atmosphereFirst = withWind(
      withAtmosphere(new MeshStandardMaterial(), shared),
      shared,
      OPTIONS,
    );

    for (const material of [windFirst, atmosphereFirst]) {
      const shader = compile(material);
      expect(shader.vertexShader).toContain('windGust(');
      expect(shader.vertexShader).toContain('vAtmosWorld = ');
      expect(shader.vertexShader.match(/#include <common>/g)).toHaveLength(1);
      expect(shader.vertexShader.match(/#define GITPLORE_NOISE/g)).toHaveLength(1);
      expect(shader.uniforms['windParams']).toBe(shared.wind);
      expect(shader.uniforms['atmosHeightFog']).toBe(shared.heightFog);
    }
  });

  it('returns the material it patched', () => {
    const material = new MeshStandardMaterial();

    expect(withWind(material, new SharedUniforms(LICHTUNG), OPTIONS)).toBe(material);
  });
});

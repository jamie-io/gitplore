import {
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { LICHTUNG } from '../mood';
import { withAtmosphere } from './atmosphere';
import { SharedUniforms } from './shared-uniforms';

function compile(material: MeshStandardMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe('withAtmosphere', () => {
  it("replaces Three's fog with the atmosphere in the fragment shader", () => {
    const shader = compile(
      withAtmosphere(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG)),
    );

    expect(shader.fragmentShader).not.toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain('uniform vec3 atmosSunDirection;');
    expect(shader.fragmentShader).toContain('atmosHeightFog');
  });

  it('carries the world position from the vertex shader', () => {
    const shader = compile(
      withAtmosphere(new MeshStandardMaterial(), new SharedUniforms(LICHTUNG)),
    );

    expect(shader.vertexShader).toContain('varying vec3 vAtmosWorld;');
    expect(shader.vertexShader).toContain('vAtmosWorld = ');
    expect(shader.fragmentShader).toContain('varying vec3 vAtmosWorld;');
  });

  it('binds the shared uniforms by identity, so one update reaches every material', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const shader = compile(withAtmosphere(new MeshStandardMaterial(), shared));

    expect(shader.uniforms['atmosSunDirection']).toBe(shared.sunDirection);
    expect(shader.uniforms['atmosSunColor']).toBe(shared.sunColor);
    expect(shader.uniforms['atmosHeightFog']).toBe(shared.heightFog);
  });

  it('returns the material it patched', () => {
    const material = new MeshStandardMaterial();

    expect(withAtmosphere(material, new SharedUniforms(LICHTUNG))).toBe(material);
  });
});

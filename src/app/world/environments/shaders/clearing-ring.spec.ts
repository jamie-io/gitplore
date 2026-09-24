import {
  MeshStandardMaterial,
  ShaderLib,
  Vector3,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { withClearingRing } from './clearing-ring';

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

describe('withClearingRing', () => {
  const clearing = {
    origin: { value: new Vector3(1, 2, 3) },
    radius: { value: 12 },
    glow: { value: 0.5 },
  };

  it('shares the clearing uniforms by identity, so the flow drives them without a recompile', () => {
    const shader = compile(withClearingRing(new MeshStandardMaterial(), clearing));

    expect(shader.uniforms['uClearOrigin']).toBe(clearing.origin);
    expect(shader.uniforms['uClearRadius']).toBe(clearing.radius);
    expect(shader.uniforms['uClearGlow']).toBe(clearing.glow);
  });

  it('adds an emissive band at the edge, in world space, and nothing while the glow is 0', () => {
    const shader = compile(withClearingRing(new MeshStandardMaterial(), clearing));

    expect(shader.vertexShader).toContain('vClearWorld = ');
    expect(shader.fragmentShader).toContain('varying vec3 vClearWorld;');
    expect(shader.fragmentShader).toContain('if (uClearGlow > 0.0)');
    expect(shader.fragmentShader).toContain('length(vClearWorld.xz - uClearOrigin.xz)');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    // Three's own emissive map still runs first.
    expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
  });

  it('keys its program apart from an unpatched material', () => {
    const plain = new MeshStandardMaterial();
    const patched = withClearingRing(new MeshStandardMaterial(), clearing);

    expect(patched.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(patched.customProgramCacheKey()).toContain('clearing-ring');
  });
});

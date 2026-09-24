import {
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { DSCHUNGEL } from '../mood';
import { withAtmosphere } from './atmosphere';
import { withDapple } from './dapple';
import { withGroundDetail } from './ground-detail';
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

describe('withGroundDetail', () => {
  it('leaves the weakest tier with exactly Three’s own program', () => {
    const plain = new MeshStandardMaterial();
    const material = withGroundDetail(new MeshStandardMaterial(), 0);
    const shader = compile(material);

    expect(shader.vertexShader).toBe(ShaderLib.standard.vertexShader);
    expect(shader.fragmentShader).toBe(ShaderLib.standard.fragmentShader);
    expect(material.customProgramCacheKey()).toBe(plain.customProgramCacheKey());
  });

  it('pools wet patches that darken the floor and turn it glossy on the medium tier', () => {
    const shader = compile(withGroundDetail(new MeshStandardMaterial(), 1));

    expect(shader.fragmentShader).toContain('smoothstep(0.6, 0.72');
    expect(shader.fragmentShader).toContain('mix(1.0, 0.55, groundWet)');
    expect(shader.fragmentShader).toContain(
      'roughnessFactor = mix(roughnessFactor, 0.08, groundWet)',
    );
    expect(shader.fragmentShader).toContain('0.82 + 0.36 * noise2(vGroundWorld.xz * 3.7)');
    // Leaf litter is the strongest tier's alone.
    expect(shader.fragmentShader).not.toContain('vec3(0.30, 0.21, 0.10)');
  });

  it('adds leaf-litter speckle on the high tier, kept off the wet patches', () => {
    const shader = compile(withGroundDetail(new MeshStandardMaterial(), 2));

    expect(shader.fragmentShader).toContain(
      'smoothstep(0.78, 0.84, noise2(vGroundWorld.xz * 8.5))',
    );
    expect(shader.fragmentShader).toContain('vec3(0.30, 0.21, 0.10)');
    expect(shader.fragmentShader).toContain('* 0.6 * (1.0 - groundWet)');
  });

  it('keys its program by tier, so the medium and high floors never share one', () => {
    const medium = withGroundDetail(new MeshStandardMaterial(), 1);
    const high = withGroundDetail(new MeshStandardMaterial(), 2);

    expect(medium.customProgramCacheKey()).not.toBe(high.customProgramCacheKey());
  });

  it('works out world positions itself, needing no screen-space derivatives', () => {
    const shader = compile(withGroundDetail(new MeshStandardMaterial(), 2));

    expect(shader.vertexShader).toContain('vGroundWorld = ');
    expect(shader.fragmentShader).not.toMatch(/dFdx|dFdy|fwidth/);
  });

  it('stacks on the dapple and the atmosphere with one noise chunk and one common include', () => {
    const shared = new SharedUniforms(DSCHUNGEL);
    const material = withGroundDetail(
      withDapple(withAtmosphere(new MeshStandardMaterial(), shared), shared, 0.75),
      2,
    );
    const shader = compile(material);

    expect(shader.fragmentShader).toContain('dappleFactor');
    expect(shader.fragmentShader).toContain('atmosphereFog(');
    expect(shader.fragmentShader).toContain('groundWet');
    expect(shader.fragmentShader.match(/#include <common>/g)).toHaveLength(1);
  });
});

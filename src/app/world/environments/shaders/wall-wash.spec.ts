import {
  Color,
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { withWallWash } from './wall-wash';

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

describe('withWallWash', () => {
  it('adds the wash to the emissive term from the world height', () => {
    const shader = compile(
      withWallWash(new MeshStandardMaterial(), { top: 7, colour: 0xfff6e8, strength: 0.4 }),
    );

    expect(shader.vertexShader).toContain('vWallWashHeight = ');
    expect(shader.vertexShader).toContain('#include <project_vertex>');
    expect(shader.fragmentShader).toContain('varying float vWallWashHeight;');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb');
  });

  it('sets its uniforms from the options', () => {
    const shader = compile(
      withWallWash(new MeshStandardMaterial(), { top: 6.5, colour: 0xff8800, strength: 0.3 }),
    );

    expect(shader.uniforms['wallWashTop'].value).toBe(6.5);
    expect((shader.uniforms['wallWashColour'].value as Color).equals(new Color(0xff8800))).toBe(
      true,
    );
    expect(shader.uniforms['wallWashStrength'].value).toBe(0.3);
  });

  it('keys the program so an unwashed wall does not share it', () => {
    const plain = new MeshStandardMaterial();
    const washed = withWallWash(new MeshStandardMaterial(), {
      top: 7,
      colour: 0xffffff,
      strength: 0.4,
    });

    expect(washed.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(washed.customProgramCacheKey()).toContain('wall-wash');
  });
});

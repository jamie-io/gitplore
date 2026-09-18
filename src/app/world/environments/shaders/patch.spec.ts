import { MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { patchMaterial } from './patch';

function fakeShader(): WebGLProgramParametersWithUniforms {
  return {
    vertexShader: 'void main() {}',
    fragmentShader: 'void main() {}',
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
}

const NO_RENDERER = {} as WebGLRenderer;

describe('patchMaterial', () => {
  it('runs every patch, earliest first, on the same shader', () => {
    const material = new MeshStandardMaterial();
    const order: string[] = [];

    patchMaterial(material, 'first', (shader) => {
      order.push('first');
      shader.vertexShader = shader.vertexShader.replace('void main', 'void first_main');
    });
    patchMaterial(material, 'second', (shader) => {
      order.push('second');
      shader.vertexShader = shader.vertexShader.replace('first_main', 'second_main');
    });

    const shader = fakeShader();
    material.onBeforeCompile(shader, NO_RENDERER);

    expect(order).toEqual(['first', 'second']);
    expect(shader.vertexShader).toBe('void second_main() {}');
  });

  it('keeps a patch the caller installed before us', () => {
    const material = new MeshStandardMaterial();
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = '// mine\n' + shader.fragmentShader;
    };

    patchMaterial(material, 'ours', (shader) => {
      shader.fragmentShader = shader.fragmentShader + '\n// ours';
    });

    const shader = fakeShader();
    material.onBeforeCompile(shader, NO_RENDERER);

    expect(shader.fragmentShader).toBe('// mine\nvoid main() {}\n// ours');
  });

  it('puts every patch key into the program cache key', () => {
    const material = patchMaterial(
      patchMaterial(new MeshStandardMaterial(), 'atmosphere', () => undefined),
      'wind',
      () => undefined,
    );

    const key = material.customProgramCacheKey();

    expect(key).toContain('atmosphere');
    expect(key).toContain('wind');
    expect(key.indexOf('atmosphere')).toBeLessThan(key.indexOf('wind'));
  });

  it('gives materials with different patch sets different cache keys', () => {
    const one = patchMaterial(new MeshStandardMaterial(), 'atmosphere', () => undefined);
    const two = patchMaterial(new MeshStandardMaterial(), 'wind', () => undefined);

    expect(one.customProgramCacheKey()).not.toBe(two.customProgramCacheKey());
  });

  it('returns the material it patched, so it slots into a constructor call', () => {
    const material = new MeshStandardMaterial();

    expect(patchMaterial(material, 'x', () => undefined)).toBe(material);
  });
});

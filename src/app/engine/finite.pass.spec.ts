import { ShaderMaterial } from 'three';
import { FinitePass, HALF_FLOAT_MAX } from './finite.pass';

describe('FinitePass', () => {
  function fragmentShader(): string {
    const pass = new FinitePass();
    const material = pass.material as ShaderMaterial;
    const source = material.fragmentShader;
    pass.dispose();
    return source;
  }

  it('tests every channel against the half-float range by comparison, not isnan', () => {
    const source = fragmentShader();

    expect(source).toContain(`value > -${HALF_FLOAT_MAX.toFixed(1)}`);
    expect(source).toContain(`value < ${HALF_FLOAT_MAX.toFixed(1)}`);
    expect(source).not.toMatch(/\bisnan\b|\bisinf\b/);
    for (const channel of ['r', 'g', 'b', 'a']) {
      expect(source).toContain(`finite(texel.${channel})`);
    }
  });

  it('mirrors the shader rule: finite values pass, NaN and infinities become 0', () => {
    // The shader's ternary, in TypeScript, so the rule itself is pinned down.
    const finite = (value: number) =>
      value > -HALF_FLOAT_MAX && value < HALF_FLOAT_MAX ? value : 0;

    expect(finite(0.25)).toBe(0.25);
    expect(finite(12)).toBe(12);
    expect(finite(Number.NaN)).toBe(0);
    expect(finite(Number.POSITIVE_INFINITY)).toBe(0);
    expect(finite(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

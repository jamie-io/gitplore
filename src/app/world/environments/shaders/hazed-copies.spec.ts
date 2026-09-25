import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { DSCHUNGEL } from '../mood';
import { HazedCopies } from './hazed-copies';
import { SharedUniforms } from './shared-uniforms';

describe('HazedCopies', () => {
  it('copies each standard material once and leaves its original untouched', () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const original = new MeshStandardMaterial({ name: 'stone' });
    const other = new MeshStandardMaterial({ name: 'wood' });
    const originalCompile = original.onBeforeCompile;
    const originalKey = original.customProgramCacheKey();

    const copy = haze.of(original);
    const otherCopy = haze.of(other);

    expect(copy).toBeInstanceOf(MeshStandardMaterial);
    expect(copy).not.toBe(original);
    expect(haze.of(original)).toBe(copy);
    expect(otherCopy).not.toBe(copy);
    expect(haze.of(other)).toBe(otherCopy);
    expect(original.onBeforeCompile).toBe(originalCompile);
    expect(original.customProgramCacheKey()).toBe(originalKey);
    expect(copy.customProgramCacheKey()).toContain('atmosphere');

    haze.dispose();
  });

  it('returns non-standard materials unchanged', () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const original = new MeshBasicMaterial();

    expect(haze.of(original)).toBe(original);
  });

  it('patches owned material in place and leaves it undisposed', () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const material = new MeshStandardMaterial();
    const dispose = vi.spyOn(material, 'dispose');

    expect(haze.own(material)).toBe(material);
    expect(material.customProgramCacheKey()).toContain('atmosphere');

    haze.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes each copied material once', () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const first = haze.of(new MeshStandardMaterial());
    const second = haze.of(new MeshStandardMaterial());
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');

    haze.dispose();
    haze.dispose();

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });
});

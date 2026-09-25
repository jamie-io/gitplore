import { Material, WebGLProgramParametersWithUniforms } from 'three';

/**
 * Adds a shader patch to `material` without discarding one that is already there: wind on top of
 * atmosphere, atmosphere on top of a caller's own tweak. Earlier patches run first, so a later one
 * sees the source the earlier one produced.
 *
 * `key` goes into the program cache key. Three otherwise keys programs on the source text of
 * `onBeforeCompile`, which is identical for every material patched through this wrapper, so
 * without it two materials with different patch sets would silently share a program. A function
 * is read each time Three asks, for a patch whose source depends on something set after it is
 * applied (the ground haze's step count, set when the world learns its tier).
 */
export function patchMaterial<T extends Material>(
  material: T,
  key: string | (() => string),
  patch: (shader: WebGLProgramParametersWithUniforms) => void,
): T {
  const previousCompile = material.onBeforeCompile;
  // A material that never set its own key falls back to `Material.prototype.customProgramCacheKey`,
  // which reads `this.onBeforeCompile` — after this call that would be our wrapper, the same for
  // every patched material. Reproduce the default against the hook we are wrapping instead.
  const ownKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey
    : undefined;
  const previousKey = ownKey ? () => ownKey.call(material) : () => previousCompile.toString();

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    patch(shader);
  };
  const keyNow = typeof key === 'string' ? () => key : key;
  material.customProgramCacheKey = () => `${previousKey()}|${keyNow()}`;

  return material;
}

import { MeshStandardMaterial } from 'three';
import { NOISE_GLSL } from './noise.glsl';
import { patchMaterial } from './patch';

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vGroundWorld;
#include <common>`;

// After `project_vertex`, like the atmosphere and the dapple, and keeping the include so they
// still find it whichever is applied first.
const VERTEX_WORLD_POSITION = /* glsl */ `
#include <project_vertex>
vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
${NOISE_GLSL}
varying vec3 vGroundWorld;

// Puddles a few metres across where two value-noise layers agree, 0 dry … 1 standing water.
float groundWetness(vec2 p) {
  float n = noise2(p * 0.3) * 0.65 + noise2(p * 1.25) * 0.35;
  return smoothstep(0.6, 0.72, n);
}`;

// Right after the vertex colour is folded into the albedo: the wet patches first, since the
// litter stays off them, then the grain, the litter and the darkening of the wet ground.
function fragmentAlbedo(detail: 1 | 2): string {
  const litter = /* glsl */ `
float groundLitter = smoothstep(0.78, 0.84, noise2(vGroundWorld.xz * 8.5));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.21, 0.10), groundLitter * 0.6 * (1.0 - groundWet));`;
  return /* glsl */ `
#include <color_fragment>
float groundWet = groundWetness(vGroundWorld.xz);
diffuseColor.rgb *= 0.82 + 0.36 * noise2(vGroundWorld.xz * 3.7);${detail > 1 ? litter : ''}
diffuseColor.rgb *= mix(1.0, 0.55, groundWet);`;
}

const FRAGMENT_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.08, groundWet);`;

/**
 * The forest floor up close: glossy dark puddles and a fine grain on the medium tier, leaf-litter
 * speckle on top on the high tier. Everything is value noise over the world position, so there is
 * no texture to load and no screen-space derivative for SwiftShader to get wrong. On `detail` 0
 * the material is returned untouched and compiles to exactly Three's own program; the moving leaf
 * shadows are `withDapple`'s, on every tier.
 */
export function withGroundDetail<T extends MeshStandardMaterial>(
  material: T,
  detail: 0 | 1 | 2,
): T {
  if (detail === 0) {
    return material;
  }

  return patchMaterial(material, `ground-detail-${detail}`, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_DECLARATIONS)
      .replace('#include <color_fragment>', fragmentAlbedo(detail))
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS);
  });
}

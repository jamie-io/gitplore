import { Color, MeshStandardMaterial } from 'three';
import { patchMaterial } from './patch';

const VERTEX_DECLARATIONS = /* glsl */ `
varying float vWallWashHeight;
#include <common>`;

// After `project_vertex`, like the other patches, so an instanced or batched wall measures its own
// world height; the include stays for whichever patch comes next.
const VERTEX_HEIGHT = /* glsl */ `
#include <project_vertex>
{
  vec4 washPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    washPosition = batchingMatrix * washPosition;
  #endif
  #ifdef USE_INSTANCING
    washPosition = instanceMatrix * washPosition;
  #endif
  vWallWashHeight = (modelMatrix * washPosition).y;
}`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
varying float vWallWashHeight;
uniform float wallWashTop;
uniform vec3 wallWashColour;
uniform float wallWashStrength;`;

// Added as light the surface gives back, so it takes the wall's own colour and a dark fitting in
// the washed band stays dark. Squared, so the lower half of the wall is left almost alone and the
// brightening gathers under the ceiling, the way a wash from above falls off down a wall.
const FRAGMENT_WASH = /* glsl */ `
#include <emissivemap_fragment>
{
  float wash = clamp(vWallWashHeight / wallWashTop, 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * wallWashColour * (wallWashStrength * wash * wash);
}`;

/**
 * Brightens whatever `material` shades towards the height `top` in a soft gradient of the ceiling
 * fixtures' colour, as if the lights overhead washed down the wall. It is the cheap stand-in for
 * the bounce a closed room gets from its ceiling: a few instructions and no light in the loop, so
 * it costs the software renderer behind the lowest tier next to nothing.
 */
export function withWallWash<T extends MeshStandardMaterial>(
  material: T,
  options: { readonly top: number; readonly colour: number; readonly strength: number },
): T {
  return patchMaterial(material, 'wall-wash', (shader) => {
    shader.uniforms['wallWashTop'] = { value: Math.max(options.top, 1e-3) };
    shader.uniforms['wallWashColour'] = { value: new Color(options.colour) };
    shader.uniforms['wallWashStrength'] = { value: options.strength };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_HEIGHT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_DECLARATIONS)
      .replace('#include <emissivemap_fragment>', FRAGMENT_WASH);
  });
}

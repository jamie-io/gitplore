import { MeshStandardMaterial } from 'three';
import { patchMaterial } from './patch';
import { SharedUniforms } from './shared-uniforms';

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vAtmosWorld;
#include <common>`;

// Runs after `project_vertex`, where `transformed` is final and the batching and instance matrices
// are in scope, so the same patch fogs a scattered instanced grove and a single mesh alike.
const VERTEX_WORLD_POSITION = /* glsl */ `
#include <project_vertex>
{
  vec4 atmosPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    atmosPosition = batchingMatrix * atmosPosition;
  #endif
  #ifdef USE_INSTANCING
    atmosPosition = instanceMatrix * atmosPosition;
  #endif
  vAtmosWorld = (modelMatrix * atmosPosition).xyz;
}`;

/**
 * The one fog every world surface goes through, as a GLSL function `atmosphereFog(colour,
 * worldPosition, sunDirection, sunColor, heightFog)`: two fogs, whichever is stronger wins. Three's
 * own distance fog, and an exponential height fog integrated analytically along the view ray, so
 * a hollow fills with haze while a hilltop stays clear. Looking into the sun warms the haze towards
 * the sun colour; the exponent keeps that glow to a lobe around the disc instead of tinting the
 * whole sky-facing half. `heightFog` is `SharedUniforms.heightFog`: x density, y falloff, z scatter.
 *
 * A `ShaderMaterial` that cannot take `withAtmosphere` (the water) pastes this after its uniform
 * declarations and calls it, so its haze can never drift from the bank beside it. It reads Three's
 * `fogColor`, `fogNear`, `fogFar` and `fogDensity`, which the caller declares, and does nothing
 * without `USE_FOG`.
 */
export const ATMOSPHERE_FOG_GLSL = /* glsl */ `
vec3 atmosphereFog(vec3 colour, vec3 worldPosition, vec3 sunDirection, vec3 sunColor, vec3 heightFog) {
  #ifdef USE_FOG
    vec3 toFrag = worldPosition - cameraPosition;
    float dist = length(toFrag);
    vec3 dir = toFrag / max(dist, 1e-4);
    #ifdef FOG_EXP2
      float linearFog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    #else
      float linearFog = smoothstep(fogNear, fogFar, dist);
    #endif
    float k = heightFog.y;
    float dy = toFrag.y;
    // A flat ray or a zero falloff reduces the integral to the density at the camera's height.
    float along = (k > 1e-4 && abs(dy) > 1e-3)
      ? (exp(-k * cameraPosition.y) - exp(-k * worldPosition.y)) / (k * dy)
      : exp(-k * cameraPosition.y);
    float heightAmount = 1.0 - exp(-heightFog.x * dist * along);
    float amount = clamp(max(linearFog, heightAmount), 0.0, 1.0);
    float toward = pow(max(dot(dir, sunDirection), 0.0), 8.0);
    vec3 tint = mix(fogColor, sunColor, toward * heightFog.z);
    return mix(colour, tint, amount);
  #else
    return colour;
  #endif
}`;

// `fog_pars_fragment` stays, so Three's fog uniforms are declared the way every other chunk expects.
const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <fog_pars_fragment>
varying vec3 vAtmosWorld;
uniform vec3 atmosSunDirection;
uniform vec3 atmosSunColor;
uniform vec3 atmosHeightFog;
${ATMOSPHERE_FOG_GLSL}`;

const FRAGMENT_FOG = /* glsl */ `
gl_FragColor.rgb = atmosphereFog(gl_FragColor.rgb, vAtmosWorld, atmosSunDirection, atmosSunColor, atmosHeightFog);`;

/**
 * Replaces Three's distance fog on `material` with the world's atmosphere: the same distance fog
 * plus height fog that pools in the low ground, both warmed towards the sun. The uniforms are the
 * `SharedUniforms` objects themselves, so the world updates them once and every fogged material
 * follows.
 */
export function withAtmosphere<T extends MeshStandardMaterial>(
  material: T,
  shared: SharedUniforms,
): T {
  return patchMaterial(material, 'atmosphere', (shader) => {
    shader.uniforms['atmosSunDirection'] = shared.sunDirection;
    shader.uniforms['atmosSunColor'] = shared.sunColor;
    shader.uniforms['atmosHeightFog'] = shared.heightFog;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', FRAGMENT_DECLARATIONS)
      .replace('#include <fog_fragment>', FRAGMENT_FOG);
  });
}

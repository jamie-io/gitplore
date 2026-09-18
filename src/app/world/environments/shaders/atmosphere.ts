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

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <fog_pars_fragment>
varying vec3 vAtmosWorld;
uniform vec3 atmosSunDirection;
uniform vec3 atmosSunColor;
uniform vec3 atmosHeightFog;`;

// Two fogs, whichever is stronger wins: Three's own distance fog, and an exponential height fog
// integrated analytically along the view ray, so a hollow fills with haze while a hilltop stays
// clear. Looking into the sun warms the haze towards the sun colour; the exponent keeps that glow
// to a lobe around the disc instead of tinting the whole sky-facing half.
const FRAGMENT_FOG = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 toFrag = vAtmosWorld - cameraPosition;
    float dist = length(toFrag);
    vec3 dir = toFrag / max(dist, 1e-4);
    #ifdef FOG_EXP2
      float linearFog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    #else
      float linearFog = smoothstep(fogNear, fogFar, dist);
    #endif
    float k = atmosHeightFog.y;
    float dy = toFrag.y;
    // A flat ray or a zero falloff reduces the integral to the density at the camera's height.
    float along = (k > 1e-4 && abs(dy) > 1e-3)
      ? (exp(-k * cameraPosition.y) - exp(-k * vAtmosWorld.y)) / (k * dy)
      : exp(-k * cameraPosition.y);
    float heightFog = 1.0 - exp(-atmosHeightFog.x * dist * along);
    float amount = clamp(max(linearFog, heightFog), 0.0, 1.0);
    float toward = pow(max(dot(dir, atmosSunDirection), 0.0), 8.0);
    vec3 tint = mix(fogColor, atmosSunColor, toward * atmosHeightFog.z);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, tint, amount);
  }
#endif`;

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

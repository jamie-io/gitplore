import { MeshStandardMaterial, ShaderChunk } from 'three';
import { NOISE_GLSL } from './noise.glsl';
import { patchMaterial } from './patch';
import { SharedUniforms } from './shared-uniforms';

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vDappleWorld;
#include <common>`;

// After `project_vertex`, where `transformed` is final and the instance matrix is in scope, the
// same way the atmosphere finds its world position; both keep the include so the other still
// finds it whichever is applied first.
const VERTEX_WORLD_POSITION = /* glsl */ `
#include <project_vertex>
{
  vec4 dapplePosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    dapplePosition = batchingMatrix * dapplePosition;
  #endif
  #ifdef USE_INSTANCING
    dapplePosition = instanceMatrix * dapplePosition;
  #endif
  vDappleWorld = (modelMatrix * dapplePosition).xyz;
}`;

/**
 * The canopy's gaps as seen from below: two value-noise layers, one for the broad openings (about
 * 4 m across) and a finer one for the sun flecks between single leaves (under a metre), summed and
 * thresholded, so the flecks crowd together where the canopy opens and thin out where it closes.
 * Without shadow maps (only the low tier draws none) the broad layer is left out. The sample point is
 * where the sun ray through the fragment crosses y = 0, so a boulder or a slope shows the same
 * pattern shifted along the sun direction, the way a real leaf shadow would fall on it. Kept to
 * two look-ups, one on the low tier, because the ground is the biggest surface on screen.
 */
const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
${NOISE_GLSL}
varying vec3 vDappleWorld;
uniform vec3 dappleSunDirection;
uniform float dappleTime;
uniform float dappleStrength;

float dappleLight(vec3 worldPosition, vec3 sunDirection, float time) {
  vec2 q = worldPosition.xz - sunDirection.xz * (worldPosition.y / max(sunDirection.y, 0.2));
  vec2 drift = vec2(time * 0.05, time * 0.032);
  vec2 sway = vec2(sin(time * 0.6), cos(time * 0.45)) * 0.12;
  float leaves = noise2(q * 1.1 - drift * 1.6 + sway);
  #ifdef USE_SHADOWMAP
    float gaps = noise2(q * 0.22 + drift);
    float canopy = gaps * 0.5 + leaves * 0.5;
    return smoothstep(0.42, 0.58, canopy);
  #else
    // No shadow maps is the low tier, whose software renderer feels every look-up on the floor:
    // the flecks alone, evenly spread.
    return smoothstep(0.4, 0.6, leaves);
  #endif
}`;

/** Where the loop declares its `IncidentLight`: the factor is computed once, before any light. */
const LIGHT_DECLARATION = 'IncidentLight directLight;';
const LIGHT_DECLARATION_DAPPLED = /* glsl */ `IncidentLight directLight;
#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
  // No sun-like light, no dapples: the noise is not even evaluated.
  float dappleFactor = mix(1.0, dappleLight(vDappleWorld, dappleSunDirection, dappleTime), dappleStrength);
#endif`;

/** Both of Three's sun-like lights; `Sun` uses `DirectionalLight`, but the loop knows two. */
const LIGHT_INFO_CALLS = [
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getSunLightInfo( sunLight, directLight );',
] as const;

/**
 * Three's whole light loop with the dapple factor applied to each sun-like light's colour right
 * after it is read and before the shadow test and `RE_Direct`. Multiplying there, rather than the
 * albedo, is what keeps the dapples out of the shade: inside a tree's shadow the direct light is
 * already zero, and the hemisphere light that remains never sees the factor.
 */
function dappledLightLoop(): string {
  let chunk = ShaderChunk.lights_fragment_begin.replace(
    LIGHT_DECLARATION,
    LIGHT_DECLARATION_DAPPLED,
  );
  for (const call of LIGHT_INFO_CALLS) {
    chunk = chunk.replace(call, `${call}\n\t\tdirectLight.color *= dappleFactor;`);
  }
  return chunk;
}

/**
 * Leaf-shadow dapples moving slowly across whatever this material shades: the direct sunlight is
 * broken up by a projected canopy pattern that drifts on the shared clock, so reduced motion holds
 * it still. `strength` is how dark the shade between the patches goes (1 = fully shaded); at 0
 * the material is returned untouched and compiles to exactly Three's own program.
 */
export function withDapple<T extends MeshStandardMaterial>(
  material: T,
  shared: SharedUniforms,
  strength: number,
): T {
  if (strength <= 0) {
    return material;
  }

  return patchMaterial(material, 'dapple', (shader) => {
    shader.uniforms['dappleSunDirection'] = shared.sunDirection;
    shader.uniforms['dappleTime'] = shared.time;
    shader.uniforms['dappleStrength'] = { value: Math.min(strength, 1) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_DECLARATIONS)
      .replace('#include <lights_fragment_begin>', dappledLightLoop());
  });
}

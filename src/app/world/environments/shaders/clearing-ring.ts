import { MeshStandardMaterial, Vector3 } from 'three';
import { patchMaterial } from './patch';

/** The uniforms the ring reads, shared by identity with whoever drives them. */
export interface ClearingUniforms {
  /** The ring's centre, world space. */
  readonly origin: { readonly value: Vector3 };
  /** Metres from the centre to the ring's edge. */
  readonly radius: { readonly value: number };
  /** How brightly the edge glows, 0 … 1; 0 draws nothing. */
  readonly glow: { readonly value: number };
}

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vClearWorld;
#include <common>`;

// After `project_vertex`, like the atmosphere and the dapples, which keep the include for it.
const VERTEX_WORLD_POSITION = /* glsl */ `
#include <project_vertex>
{
  vec4 clearPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    clearPosition = instanceMatrix * clearPosition;
  #endif
  vClearWorld = (modelMatrix * clearPosition).xyz;
}`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
varying vec3 vClearWorld;
uniform vec3 uClearOrigin;
uniform float uClearRadius;
uniform float uClearGlow;`;

/**
 * An amber line where the clearing's edge crosses the ground, a couple of metres wide, with a
 * faint warm wash trailing inside it: the ring Deslopify sends out, drawn on whatever the ground
 * is rather than floating over it. One distance and two `exp`s, nothing WebGL2-only.
 */
const FRAGMENT_RING = /* glsl */ `
#include <emissivemap_fragment>
if (uClearGlow > 0.0) {
  float clearEdge = (length(vClearWorld.xz - uClearOrigin.xz) - uClearRadius) / 1.4;
  float clearBand = exp(-clearEdge * clearEdge) + 0.05 * exp(clearEdge * 0.12) * step(clearEdge, 0.0);
  totalEmissiveRadiance += vec3(0.48, 0.34, 0.13) * (clearBand * uClearGlow);
}`;

/** Draws the clearing's spreading edge on `material`, typically the ground. */
export function withClearingRing<T extends MeshStandardMaterial>(
  material: T,
  clearing: ClearingUniforms,
): T {
  return patchMaterial(material, 'clearing-ring', (shader) => {
    shader.uniforms['uClearOrigin'] = clearing.origin;
    shader.uniforms['uClearRadius'] = clearing.radius;
    shader.uniforms['uClearGlow'] = clearing.glow;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_DECLARATIONS)
      .replace('#include <emissivemap_fragment>', FRAGMENT_RING);
  });
}

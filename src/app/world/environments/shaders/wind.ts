import { MeshStandardMaterial, Vector2 } from 'three';
import { NOISE_GLSL } from './noise.glsl';
import { patchMaterial } from './patch';
import { SharedUniforms } from './shared-uniforms';

export interface WindOptions {
  /** Metres of sway at the top of the prop. */
  readonly amplitude: number;
  /** Prop height at scale 1, metres: where the sway weight reaches 1. */
  readonly height: number;
}

/**
 * The gust field every wind-blown thing reads, so trees, bushes and grass all lean in the same
 * gust at the same moment. `wind` is `SharedUniforms.wind` (x strength, y gust scale per metre,
 * z direction in radians, azimuth convention: 0 blows towards −Z, positive towards +X).
 *
 * The broad front is value noise scrolled downwind; a finer, faster layer on top keeps the field
 * from reading as one slow wave. Both are functions of world position only, so an object samples
 * the same gust however it is instanced.
 */
export const WIND_GLSL = /* glsl */ `
${NOISE_GLSL}
#ifndef GITPLORE_WIND
#define GITPLORE_WIND

vec2 windDirection(float direction) {
  return vec2(sin(direction), -cos(direction));
}

// Rolling gusts, 0 … 1, moving across the landscape in the wind direction.
float windGust(vec2 worldXZ, vec3 wind, float time) {
  vec2 dir = windDirection(wind.z);
  vec2 p = worldXZ * wind.y - dir * time * 0.8;
  float front = noise2(p);
  float ripple = noise2(p * 3.7 + vec2(5.2, 1.3) - dir * time * 0.5);
  return front * 0.7 + ripple * 0.3;
}

// A world-space offset expressed in the space that frame maps from, for a frame that is a rotation
// times a scale (no shear, the same assumption Three makes for instance normals). The result is
// left unscaled, so a prop instanced at twice the size sways twice the metres.
vec3 windToLocal(mat3 frame, vec3 world) {
  return vec3(
    dot(frame[0], world) * inversesqrt(dot(frame[0], frame[0])),
    dot(frame[1], world) * inversesqrt(dot(frame[1], frame[1])),
    dot(frame[2], world) * inversesqrt(dot(frame[2], frame[2]))
  );
}

#endif
`;

const VERTEX_DECLARATIONS = /* glsl */ `
#include <common>
${WIND_GLSL}
uniform vec3 windParams;
uniform float windTime;
// x amplitude in metres at the top, y prop height at scale 1.
uniform vec2 windSway;`;

// Runs on `transformed` in object space, before the instance and model matrices, so the shadow,
// fog and atmosphere chunks downstream all see the swayed vertex. The gust is sampled at the
// prop's world origin (instance translation through the model matrix), so a whole crown moves as
// one and neighbouring trees do not move in lockstep. Every term carries the wind strength, so a
// still world (the showroom) displaces exactly nothing.
const VERTEX_SWAY = /* glsl */ `
#include <begin_vertex>
{
  vec3 windOrigin = modelMatrix[3].xyz;
  mat3 windFrame = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    windOrigin += windFrame * instanceMatrix[3].xyz;
    windFrame = windFrame * mat3(instanceMatrix);
  #endif
  float windWeight = pow(clamp(position.y / windSway.y, 0.0, 1.0), 2.0);
  float windSwayAmount = windParams.x * windSway.x * windWeight;
  float windPhase = hash12(windOrigin.xz) * 6.2831853;
  float gust = windGust(windOrigin.xz, windParams, windTime);
  vec2 windOffset =
    windDirection(windParams.z) * windSwayAmount * (0.3 + 0.7 * gust) +
    vec2(sin(windTime * 1.9 + windPhase), cos(windTime * 1.3 + windPhase)) * windSwayAmount * 0.12;
  transformed += windToLocal(windFrame, vec3(windOffset.x, 0.0, windOffset.y));
}`;

/**
 * Sways `material`'s vertices in the world's wind: planted at the base, moving at the crown, in
 * rolling gusts that cross the landscape. The options travel as uniforms rather than defines, so
 * every wind-blown material in a world compiles to one program whatever its height, and the
 * shared uniforms are bound by identity, so the world's one `update()` a frame moves them all.
 */
export function withWind<T extends MeshStandardMaterial>(
  material: T,
  shared: SharedUniforms,
  options: WindOptions,
): T {
  return patchMaterial(material, 'wind', (shader) => {
    shader.uniforms['windParams'] = shared.wind;
    shader.uniforms['windTime'] = shared.time;
    shader.uniforms['windSway'] = { value: new Vector2(options.amplitude, options.height) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <begin_vertex>', VERTEX_SWAY);
  });
}

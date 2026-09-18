/**
 * The one noise chunk every world shader includes, so clouds, grass, water and ground all break
 * up along the same grain and no shader carries its own copy.
 *
 * Defines `hash12`, `noise2` (value noise in [0, 1]) and `fbm2`, which sums `FBM_OCTAVES` octaves
 * (the includer may `#define` it first; default 4). The include guard lets two helpers on one
 * material both pull it in without a redefinition error.
 */
export const NOISE_GLSL = /* glsl */ `
#ifndef GITPLORE_NOISE
#define GITPLORE_NOISE

#ifndef FBM_OCTAVES
#define FBM_OCTAVES 4
#endif

// Hash without sine: stable across GPUs, unlike the classic sin(dot()) one that banded under ANGLE.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value noise: hashed lattice corners, smoothstep-blended.
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal sum, rotated a little per octave so the lattice axes never line up and show.
float fbm2(vec2 p) {
  const mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    sum += amplitude * noise2(p);
    total += amplitude;
    p = rotate * p * 2.0 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return sum / total;
}

#endif
`;

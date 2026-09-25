import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The largest finite half float. The scene renders into a half-float target, so anything beyond
 * this is already infinity there.
 */
export const HALF_FLOAT_MAX = 65504;

/**
 * Replaces every non-finite channel of the HDR image with 0 before bloom reads it. One NaN pixel
 * is enough to lose the whole frame: the bloom blur spreads it over every mip until the view is
 * nothing but the clear colour. The plaza lost its view that way on the strongest tier, twice
 * over, from a mesh without normals and from a `pow` of a negative base. This pass keeps the next
 * such bug to a few black pixels instead of a blank world.
 *
 * The test is written as comparisons rather than `isnan`/`isinf`: a comparison with NaN is always
 * false, and some drivers fold `isnan` away under fast-math optimisation.
 */
const FINITE_SHADER = {
  name: 'FiniteShader',
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    float finite(const in float value) {
      return (value > -${HALF_FLOAT_MAX.toFixed(1)} && value < ${HALF_FLOAT_MAX.toFixed(1)}) ? value : 0.0;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(finite(texel.r), finite(texel.g), finite(texel.b), finite(texel.a));
    }
  `,
};

/** The guard `ShaderPass` that runs between the scene and bloom on the strongest tier. */
export class FinitePass extends ShaderPass {
  constructor() {
    super(FINITE_SHADER);
  }
}

import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ColorGrade } from './color-grade';

/**
 * The colour pass at the end of the post stack. It runs in display space, after `OutputPass` has
 * tone-mapped and sRGB-encoded the frame, because saturation, contrast and a vignette are meant
 * as adjustments to what the visitor sees, not to scene radiance: tuned values in a `Mood` then
 * behave like the sliders in a photo editor rather than like exposure tricks.
 *
 * The final dither is static on purpose: a frame-to-frame changing pattern would make screenshots
 * unrepeatable and count as ambient motion under `prefers-reduced-motion`. Interleaved gradient
 * noise has the blue-ish spectrum that hides banding at ±½ LSB without a noise texture.
 */
const GRADE_SHADER = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    warmth: { value: 0 },
    vignette: { value: 0 },
    /** Width over height of the frame, so the vignette stays round on a wide canvas. */
    aspect: { value: 1 },
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
    uniform float saturation;
    uniform float contrast;
    uniform float warmth;
    uniform float vignette;
    uniform float aspect;
    varying vec2 vUv;

    // Interleaved gradient noise (Jimenez 2014): a screen-position hash whose spectrum is close
    // to blue, so the dither reads as fine grain rather than as a pattern.
    float gradientNoise(const in vec2 fragCoord) {
      return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 rgb = texel.rgb;

      // Saturation as a luma mix, with sRGB luma weights because the frame is already encoded.
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, saturation);

      // Contrast pivots on mid grey, so highlights and shadows move apart symmetrically.
      rgb = (rgb - 0.5) * contrast + 0.5;

      // Warmth tilts the white balance: a touch more red and less blue for a warm grade.
      rgb *= vec3(1.0 + 0.06 * warmth, 1.0, 1.0 - 0.06 * warmth);

      // Vignette measured in frame-corner units so its shape does not depend on the aspect ratio:
      // r is 0 at the centre and 1 at the corners. Quadratic fall-off keeps the middle clean.
      vec2 centred = (vUv - 0.5) * vec2(aspect, 1.0);
      float r = length(centred) / length(vec2(0.5 * aspect, 0.5));
      float fall = smoothstep(0.35, 1.0, r);
      rgb *= 1.0 - vignette * fall * fall;

      rgb += (gradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;

      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), texel.a);
    }
  `,
};

/** The grade `ShaderPass`, with the grade applied through {@link GradePass.apply} every frame. */
export class GradePass extends ShaderPass {
  constructor() {
    super(GRADE_SHADER);
  }

  /** Copies a scene's grade into the uniforms; cheap enough to run every frame. */
  apply(grade: ColorGrade): void {
    this.uniforms['saturation'].value = grade.saturation;
    this.uniforms['contrast'].value = grade.contrast;
    this.uniforms['warmth'].value = grade.warmth;
    this.uniforms['vignette'].value = grade.vignette;
  }

  override setSize(width: number, height: number): void {
    this.uniforms['aspect'].value = height > 0 ? width / height : 1;
  }
}

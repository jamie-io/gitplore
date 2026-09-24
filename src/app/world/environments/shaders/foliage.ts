import { MeshStandardMaterial } from 'three';
import { patchMaterial } from './patch';
import { SharedUniforms } from './shared-uniforms';

export interface FoliageOptions {
  /** How far the leaves give way to the visitor: 1 for plants they walk through, 0 overhead. */
  readonly push: number;
  /**
   * How much sunlight shines through a leaf seen against the sun, as emissive light on top of its
   * albedo. 0 leaves the fragment shader untouched, which is what the weakest tier gets.
   */
  readonly translucency: number;
}

const VERTEX_DECLARATIONS = /* glsl */ `
#include <common>
uniform float foliageTime;
uniform vec3 foliagePlayer;
uniform float foliagePush;

// A world-space offset in the space the frame maps from, for a frame that is a rotation times a
// per-axis scale (what \`Object3D.compose\` builds): the leaves move by exactly that many metres
// whatever the cluster's size.
vec3 foliageToLocal(mat3 frame, vec3 world) {
  return vec3(
    dot(frame[0], world) / dot(frame[0], frame[0]),
    dot(frame[1], world) / dot(frame[1], frame[1]),
    dot(frame[2], world) / dot(frame[2], frame[2])
  );
}`;

// On \`transformed\` in object space, before the instance and model matrices, so the shadow, fog
// and dapple chunks downstream all see the moved leaf. Height is measured in the world above the
// cluster's root, so a tall plant sways further than a small one, and a cluster hung upside down
// (the canopy) has no height above its root and holds still.
const VERTEX_SWAY = /* glsl */ `
#include <begin_vertex>
{
  mat4 foliageModel = modelMatrix;
  #ifdef USE_INSTANCING
    foliageModel = modelMatrix * instanceMatrix;
  #endif
  vec3 foliageRoot = foliageModel[3].xyz;
  vec3 foliageWorld = (foliageModel * vec4(transformed, 1.0)).xyz;
  float foliageHeight = max(foliageWorld.y - foliageRoot.y, 0.0);
  float foliageBend = foliageHeight * foliageHeight;
  float foliageSway = sin(foliageTime * 1.25 + foliageRoot.x * 0.6 + foliageRoot.z * 0.45);
  vec3 foliageOffset = vec3(
    (foliageSway * 0.055 + sin(foliageTime * 3.3 + foliageRoot.z * 2.1) * 0.012) * foliageBend,
    0.0,
    foliageSway * 0.03 * foliageBend
  );
  vec2 foliageAway = foliageRoot.xz - foliagePlayer.xz;
  float foliageDistance = length(foliageAway);
  // Written as 1 - smoothstep rather than a reversed smoothstep, whose result GLSL leaves undefined.
  foliageOffset.xz += foliageAway / (foliageDistance + 1e-3)
    * (1.0 - smoothstep(0.15, 1.4, foliageDistance)) * foliageHeight * 0.5 * foliagePush;
  transformed += foliageToLocal(mat3(foliageModel), foliageOffset);
}`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
uniform vec3 foliageSunDirection;
uniform vec3 foliageSunColor;
uniform float foliageTranslucency;`;

// \`-vViewPosition\` is the view ray from the eye to the fragment: it lines up with the sun when the
// visitor looks at a leaf with the sun behind it. The sun direction goes into view space here
// rather than on the CPU, so nothing has to be updated per frame.
const FRAGMENT_BACKLIGHT = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 foliageSunView = normalize((viewMatrix * vec4(foliageSunDirection, 0.0)).xyz);
  float foliageBacklight = pow(max(dot(normalize(-vViewPosition), foliageSunView), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * foliageSunColor * foliageBacklight * foliageTranslucency;
}`;

/**
 * Leaf clusters that live: they sway on the shared clock, give way around the visitor and, where
 * `translucency` is above 0, glow where the sun shines through them. Every uniform but the two
 * options is a `SharedUniforms` object bound by identity, so the world's one `update()` moves all
 * of them and the foliage itself does no work per frame. The push travels as a uniform, so plants
 * and canopy compile to one program; only translucency changes the source.
 */
export function withFoliage<T extends MeshStandardMaterial>(
  material: T,
  shared: SharedUniforms,
  options: FoliageOptions,
): T {
  const translucent = options.translucency > 0;

  return patchMaterial(material, translucent ? 'foliage-lit' : 'foliage', (shader) => {
    shader.uniforms['foliageTime'] = shared.time;
    shader.uniforms['foliagePlayer'] = shared.playerPosition;
    shader.uniforms['foliagePush'] = { value: options.push };
    shader.uniforms['foliageSunDirection'] = shared.sunDirection;
    shader.uniforms['foliageSunColor'] = shared.sunColor;
    shader.uniforms['foliageTranslucency'] = { value: options.translucency };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <begin_vertex>', VERTEX_SWAY);
    if (translucent) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', FRAGMENT_DECLARATIONS)
        .replace('#include <emissivemap_fragment>', FRAGMENT_BACKLIGHT);
    }
  });
}

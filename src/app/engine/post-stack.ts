import {
  HalfFloatType,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { gradeOf } from './color-grade';
import { FinitePass } from './finite.pass';
import { GradePass } from './grade.pass';
import type { PostStack } from './renderer.factory';

/**
 * The composer works at no more than this device pixel ratio while the canvas keeps its own: on
 * a 2× screen the five passes then touch 44 % fewer pixels, and the final pass upsamples through
 * the texture filter, which is far less visible than a lower frame rate.
 */
const COMPOSER_RATIO_CAP = 1.5;

/**
 * Ambient occlusion resolves at this fraction of the composer's size. AO is low-frequency by
 * nature and the denoiser blurs it anyway, so half resolution is nearly free in quality and
 * quarters the cost of the three AO-side passes plus the normal re-render.
 */
const AO_SCALE = 0.5;

/**
 * Ambient occlusion tuning. The radius is in metres of view space: 0.6 m is enough to darken
 * the ground under a boulder, a wall foot or a fountain rim, but not enough to reach from a
 * swaying grass blade (which the AO buffer sees standing still) to anything the visitor would
 * notice as swimming. `thickness` bounds the depth difference a sample may bridge, so a tree in
 * front of a distant hill never casts occlusion onto the hill.
 */
const AO_SETTINGS = { radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16 };

/** Bloom spreads this far across its mip chain; the strength comes from the scene's grade. */
const BLOOM_RADIUS = 0.55;

/**
 * Only linear radiance above this blooms. Tone mapping happens after bloom, so 1.0 means "brighter
 * than white": the sun disc, portal glow, bulbs and fireflies, never a sunlit wall.
 */
const BLOOM_THRESHOLD = 1.0;

function writesDepth(material: Material | Material[]): boolean {
  return Array.isArray(material) ? material.some((m) => m.depthWrite) : material.depthWrite;
}

/**
 * GTAO over the scene as the visitor sees it. The stock pass re-renders the scene with a normal
 * material to build its depth and normal buffer, which would let the sky dome, water surface and
 * every other overlay that draws without writing depth become an occluder. Anything that does not
 * write depth in the main render is hidden for that re-render, so the sky stays at the far plane
 * (where the AO shader discards) and translucent surfaces neither receive nor cast occlusion.
 *
 * The re-render would also redraw the shadow map, at 2048² the single most expensive thing in a
 * frame, so shadow updates are held off while it runs: the normal material does not read them.
 */
class SceneOcclusionPass extends GTAOPass {
  private readonly hidden: Object3D[] = [];

  override setSize(width: number, height: number): void {
    super.setSize(
      Math.max(1, Math.round(width * AO_SCALE)),
      Math.max(1, Math.round(height * AO_SCALE)),
    );
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const shadows = renderer.shadowMap;
    const autoUpdate = shadows.autoUpdate;
    const needsUpdate = shadows.needsUpdate;
    shadows.autoUpdate = false;
    shadows.needsUpdate = false;

    this.hideNonOccluders();
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    this.restoreHidden();

    shadows.autoUpdate = autoUpdate;
    shadows.needsUpdate = needsUpdate;
  }

  override dispose(): void {
    super.dispose();
    // The stock dispose forgets these two.
    this.gtaoMaterial.dispose();
    this.blendMaterial.dispose();
  }

  private hideNonOccluders(): void {
    this.scene.traverse((object) => {
      if (object.visible && object instanceof Mesh && !writesDepth(object.material)) {
        object.visible = false;
        this.hidden.push(object);
      }
    });
  }

  private restoreHidden(): void {
    for (const object of this.hidden) {
      object.visible = true;
    }
    this.hidden.length = 0;
  }
}

/**
 * The strongest tier's pass chain: the scene into a multisampled half-float target, ambient
 * occlusion, a guard that zeroes non-finite pixels (one NaN would otherwise bloom over the whole
 * frame), bloom on the HDR image, then `OutputPass` for tone mapping and sRGB, and last the
 * grade in display space. The grade and the bloom strength come from `scene.userData` every frame,
 * so a world change re-tunes the stack without the engine knowing which world is showing.
 */
export function createPostStack(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostStack {
  const size = renderer.getSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);

  const occlusion = new SceneOcclusionPass(scene, camera, size.x, size.y);
  occlusion.output = GTAOPass.OUTPUT.Default;
  occlusion.blendIntensity = 1;
  occlusion.updateGtaoMaterial(AO_SETTINGS);

  const bloom = new UnrealBloomPass(
    new Vector2(size.x / 2, size.y / 2),
    gradeOf(scene).bloomStrength,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  const grade = new GradePass();

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(occlusion);
  composer.addPass(new FinitePass());
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(grade);

  return {
    render: () => {
      const current = gradeOf(scene);
      bloom.strength = current.bloomStrength;
      grade.apply(current);
      composer.render();
    },
    setSize: (width, height) => composer.setSize(width, height),
    setPixelRatio: (ratio) => composer.setPixelRatio(Math.min(ratio, COMPOSER_RATIO_CAP)),
    dispose: () => {
      composer.passes.forEach((pass) => pass.dispose());
      composer.dispose();
    },
  };
}

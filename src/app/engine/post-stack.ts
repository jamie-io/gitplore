import {
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { PostStack } from './renderer.factory';

/**
 * The strongest tier's pass chain. It renders the scene into a multisampled half-float target, so
 * everything after it works in HDR, and ends in `OutputPass`, which applies the renderer's tone
 * mapping and sRGB conversion exactly once.
 */
export function createPostStack(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostStack {
  const size = renderer.getSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  return {
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    dispose: () => {
      composer.passes.forEach((pass) => pass.dispose());
      composer.dispose();
    },
  };
}

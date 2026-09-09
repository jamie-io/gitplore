import { InjectionToken } from '@angular/core';
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { QualitySettings } from './capability.service';

/**
 * The slice of the renderer the engine actually uses. Keeping it narrow means the loop can be
 * driven by a stub in tests, and a future WebGPU swap only has to satisfy this.
 */
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  readonly shadowMap: { enabled: boolean };
  readonly info: { readonly memory: { geometries: number; textures: number } };
  readonly renderLists: { dispose(): void };
  setAnimationLoop(callback: ((time: number) => void) | null): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export type RendererFactory = (canvas: HTMLCanvasElement, quality: QualitySettings) => RendererLike;

/**
 * The only place a renderer is constructed (IMPLEMENTATION_PLAN.md §2), so swapping WebGL for
 * something else later stays a one-file change.
 */
export const createRenderer: RendererFactory = (canvas, quality) => {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    powerPreference: 'high-performance',
    alpha: false,
  });

  renderer.shadowMap.enabled = quality.shadows;
  return renderer;
};

export const RENDERER_FACTORY = new InjectionToken<RendererFactory>('RENDERER_FACTORY', {
  providedIn: 'root',
  factory: () => createRenderer,
});

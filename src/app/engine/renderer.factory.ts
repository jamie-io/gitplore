import { InjectionToken } from '@angular/core';
import { NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { QualitySettings } from './capability.service';

/**
 * The slice of the renderer the engine actually uses. Keeping it narrow means the loop can be
 * driven by a stub in tests, and a future WebGPU swap only has to satisfy this.
 */
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  readonly info: { readonly memory: { geometries: number; textures: number } };
  readonly renderLists: { dispose(): void };
  setAnimationLoop(callback: ((time: number) => void) | null): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  /** Applies a quality tier: shadows, and the post stack on or off. */
  setQuality(quality: QualitySettings): void;
  dispose(): void;
}

/** The pass chain between the scene and the canvas on the strongest tier. */
export interface PostStack {
  render(): void;
  /** CSS pixels, like `WebGLRenderer.setSize`. */
  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

export type PostStackFactory = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
) => PostStack;

/** Fetches the post stack's code: its own chunk, so tiers without post-processing never load it. */
export type PostStackLoader = () => Promise<PostStackFactory>;

const loadPostStack: PostStackLoader = () =>
  import('./post-stack').then((module) => module.createPostStack);

/**
 * A `WebGLRenderer` that follows the quality tier: shadows on or off and, on the strongest tier, a
 * post stack between the scene and the canvas. The stack loads lazily on the first frame that
 * wants it; until it lands, frames go straight to the canvas, so switching tiers never blanks the
 * world.
 */
export class QualityRenderer implements RendererLike {
  private post: PostStack | null = null;
  private wantsPost = false;
  private loading = false;
  private disposed = false;
  /** Bumped whenever post-processing is switched off, so a load that lands afterwards is dropped. */
  private generation = 0;
  private size = { width: 1, height: 1 };
  private pixelRatio = 1;

  constructor(
    private readonly gl: WebGLRenderer,
    quality: QualitySettings,
    private readonly loadPost: PostStackLoader = loadPostStack,
  ) {
    // Neutral rather than ACES: palettes and project screenshots are picked by hand and should
    // come out as picked; the post stack's grade adds contrast where a world wants it.
    gl.toneMapping = NeutralToneMapping;
    gl.toneMappingExposure = 1;
    gl.shadowMap.type = PCFShadowMap;
    this.setQuality(quality);
  }

  get domElement(): HTMLCanvasElement {
    return this.gl.domElement;
  }

  get info(): RendererLike['info'] {
    return this.gl.info;
  }

  get renderLists(): RendererLike['renderLists'] {
    return this.gl.renderLists;
  }

  setAnimationLoop(callback: ((time: number) => void) | null): void {
    this.gl.setAnimationLoop(callback);
  }

  setSize(width: number, height: number, updateStyle?: boolean): void {
    this.size = { width, height };
    this.gl.setSize(width, height, updateStyle);
    this.post?.setSize(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.gl.setPixelRatio(ratio);
    this.post?.setPixelRatio(ratio);
  }

  setQuality(quality: QualitySettings): void {
    if (this.gl.shadowMap.enabled !== quality.shadows) {
      this.gl.shadowMap.enabled = quality.shadows;
      this.gl.shadowMap.needsUpdate = true;
    }

    this.wantsPost = quality.postProcessing;
    if (!this.wantsPost) {
      this.generation++;
      this.post?.dispose();
      this.post = null;
    }
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    if (this.post) {
      this.post.render();
      return;
    }
    if (this.wantsPost) {
      this.requestPost(scene, camera);
    }
    this.gl.render(scene, camera);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.post?.dispose();
    this.post = null;
    this.gl.dispose();
  }

  private requestPost(scene: Scene, camera: PerspectiveCamera): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    const generation = this.generation;
    this.loadPost().then(
      (create) => {
        this.loading = false;
        if (this.disposed || !this.wantsPost || generation !== this.generation) {
          return;
        }
        this.post = create(this.gl, scene, camera);
        this.post.setPixelRatio(this.pixelRatio);
        this.post.setSize(this.size.width, this.size.height);
      },
      () => {
        // A failed chunk download keeps the plain path. No retry every frame: a visitor on a
        // flaky connection is not hammered with requests. The next tier change tries again.
        this.loading = false;
        if (generation === this.generation) {
          this.wantsPost = false;
        }
      },
    );
  }
}

export type RendererFactory = (canvas: HTMLCanvasElement, quality: QualitySettings) => RendererLike;

/**
 * The only place a renderer is constructed (IMPLEMENTATION_PLAN.md §2), so swapping WebGL for
 * something else later stays a one-file change.
 */
export const createRenderer: RendererFactory = (canvas, quality) =>
  new QualityRenderer(
    new WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      alpha: false,
    }),
    quality,
  );

export const RENDERER_FACTORY = new InjectionToken<RendererFactory>('RENDERER_FACTORY', {
  providedIn: 'root',
  factory: () => createRenderer,
});

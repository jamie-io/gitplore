import { NeutralToneMapping, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { QualityTier, qualitySettings } from './capability.service';
import { PostStack, PostStackFactory, QualityRenderer } from './renderer.factory';

/** Just enough of `WebGLRenderer` for the wrapper; jsdom has no WebGL. */
class FakeGl {
  readonly domElement = document.createElement('canvas');
  readonly shadowMap = { enabled: false, needsUpdate: false, type: -1 };
  readonly info = { memory: { geometries: 0, textures: 0 } };
  readonly renderLists = { dispose: () => undefined };
  toneMapping = -1;
  toneMappingExposure = 0;
  renders = 0;
  disposed = false;
  size = { width: 0, height: 0 };
  pixelRatio = 0;

  render(): void {
    this.renders++;
  }
  setSize(width: number, height: number): void {
    this.size = { width, height };
  }
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }
  setAnimationLoop(): void {
    // not driven in these tests
  }
  dispose(): void {
    this.disposed = true;
  }
}

class FakePost implements PostStack {
  renders = 0;
  disposed = false;
  size = { width: 0, height: 0 };
  pixelRatio = 0;

  render(): void {
    this.renders++;
  }
  setSize(width: number, height: number): void {
    this.size = { width, height };
  }
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }
  dispose(): void {
    this.disposed = true;
  }
}

/** A post-stack loader the test resolves by hand, so it can land before or after a tier change. */
function deferredLoader() {
  const posts: FakePost[] = [];
  let resolve: ((factory: PostStackFactory) => void) | null = null;
  let calls = 0;

  return {
    posts,
    calls: () => calls,
    loader: () => {
      calls++;
      return new Promise<PostStackFactory>((done) => (resolve = done));
    },
    async land(): Promise<void> {
      resolve?.(() => {
        const post = new FakePost();
        posts.push(post);
        return post;
      });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function setup(tier: QualityTier) {
  const gl = new FakeGl();
  const load = deferredLoader();
  const renderer = new QualityRenderer(
    gl as unknown as WebGLRenderer,
    qualitySettings(tier),
    load.loader,
  );
  return { gl, load, renderer, scene: new Scene(), camera: new PerspectiveCamera() };
}

describe('QualityRenderer', () => {
  it('tone-maps with the neutral curve, which keeps hand-picked colours true', () => {
    expect(setup('low').gl.toneMapping).toBe(NeutralToneMapping);
  });

  it('switches shadows with the tier and asks for a shadow map rebuild', () => {
    const { gl, renderer } = setup('low');
    expect(gl.shadowMap.enabled).toBe(false);

    renderer.setQuality(qualitySettings('high'));

    expect(gl.shadowMap.enabled).toBe(true);
    expect(gl.shadowMap.needsUpdate).toBe(true);
  });

  it('draws straight to the canvas without post-processing, and never loads it', () => {
    const { gl, load, renderer, scene, camera } = setup('medium');

    renderer.render(scene, camera);

    expect(gl.renders).toBe(1);
    expect(load.calls()).toBe(0);
  });

  it('keeps drawing directly while the post stack loads, then hands frames to it', async () => {
    const { gl, load, renderer, scene, camera } = setup('high');

    renderer.render(scene, camera);
    renderer.render(scene, camera);
    expect(gl.renders).toBe(2);
    expect(load.calls()).toBe(1);

    await load.land();
    renderer.render(scene, camera);

    expect(gl.renders).toBe(2);
    expect(load.posts[0].renders).toBe(1);
  });

  it('sizes a freshly loaded post stack to the canvas', async () => {
    const { load, renderer, scene, camera } = setup('high');
    renderer.setPixelRatio(1.5);
    renderer.setSize(800, 450);

    renderer.render(scene, camera);
    await load.land();

    expect(load.posts[0].size).toEqual({ width: 800, height: 450 });
    expect(load.posts[0].pixelRatio).toBe(1.5);
  });

  it('drops the post stack when the tier steps down', async () => {
    const { gl, load, renderer, scene, camera } = setup('high');
    renderer.render(scene, camera);
    await load.land();

    renderer.setQuality(qualitySettings('medium'));
    renderer.render(scene, camera);

    expect(load.posts[0].disposed).toBe(true);
    expect(gl.renders).toBe(2);
  });

  it('ignores a post stack that lands after the tier stepped down', async () => {
    const { gl, load, renderer, scene, camera } = setup('high');
    renderer.render(scene, camera);

    renderer.setQuality(qualitySettings('medium'));
    await load.land();
    renderer.render(scene, camera);

    expect(load.posts).toEqual([]);
    expect(gl.renders).toBe(2);
  });

  it('disposes the post stack together with the renderer', async () => {
    const { gl, load, renderer, scene, camera } = setup('high');
    renderer.render(scene, camera);
    await load.land();

    renderer.dispose();

    expect(load.posts[0].disposed).toBe(true);
    expect(gl.disposed).toBe(true);
  });
});

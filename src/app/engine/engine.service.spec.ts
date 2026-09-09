import { TestBed } from '@angular/core/testing';
import { Scene } from 'three';
import { CapabilityService, DEVICE_CAPABILITIES, DeviceCapabilities } from './capability.service';
import { ENGINE_MAX_FRAME_SECONDS, EngineService } from './engine.service';
import { RENDERER_FACTORY, RendererLike } from './renderer.factory';
import { HeightField } from './player/collision';
import { WorldScene } from './world-object';

const CAPABLE: DeviceCapabilities = {
  webgl2: true,
  rendererDescription: 'Apple M2',
  hardwareConcurrency: 10,
  devicePixelRatio: 2,
  reducedMotion: false,
  coarsePointer: false,
};

class StubRenderer implements RendererLike {
  loop: ((time: number) => void) | null = null;
  renders = 0;
  disposed = false;
  width = 0;
  height = 0;
  pixelRatio = 1;
  readonly domElement = document.createElement('canvas');
  readonly shadowMap = { enabled: false };
  readonly info = { memory: { geometries: 0, textures: 0 } };
  readonly renderLists = { dispose: () => undefined };

  setAnimationLoop(fn: ((time: number) => void) | null) {
    this.loop = fn;
  }
  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  setPixelRatio(ratio: number) {
    this.pixelRatio = ratio;
  }
  render() {
    this.renders++;
  }
  dispose() {
    this.disposed = true;
  }
}

const FLAT: HeightField = { heightAt: () => 0 };

function stubScene(id: string) {
  const scene: WorldScene & { initialised: number; disposed: number; updates: number[] } = {
    id,
    ground: FLAT,
    colliders: [],
    initialised: 0,
    disposed: 0,
    updates: [],
    init: () => void scene.initialised++,
    update: (dt: number) => void scene.updates.push(dt),
    dispose: () => void scene.disposed++,
  };
  return scene;
}

describe('EngineService', () => {
  let renderer: StubRenderer;
  let engine: EngineService;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    renderer = new StubRenderer();
    TestBed.configureTestingModule({
      providers: [
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: RENDERER_FACTORY, useValue: () => renderer },
      ],
    });
    engine = TestBed.inject(EngineService);
    canvas = document.createElement('canvas');
    engine.attach(canvas);
  });

  afterEach(() => engine.detach());

  const tick = (ms: number) => renderer.loop?.(ms);

  it('starts a render loop on attach', () => {
    expect(renderer.loop).toBeInstanceOf(Function);
  });

  it('renders a frame per tick', () => {
    tick(0);
    tick(16);

    expect(renderer.renders).toBe(2);
  });

  it('clamps a long gap so a backgrounded tab cannot teleport the player', () => {
    const scene = stubScene('hub');
    engine.setScene(scene);
    tick(0);
    tick(9000);

    expect(Math.max(...scene.updates)).toBeCloseTo(ENGINE_MAX_FRAME_SECONDS, 6);
  });

  it('updates registered tickables with the frame delta', () => {
    const seen: number[] = [];
    engine.addTickable({ update: (dt) => seen.push(dt) });

    tick(0);
    tick(20);

    expect(seen.at(-1)).toBeCloseTo(0.02, 6);
  });

  it('leaves a removed tickable alone', () => {
    const seen: number[] = [];
    const tickable = { update: (dt: number) => seen.push(dt) };
    engine.addTickable(tickable);
    tick(0); // primes the clock; the first frame has no delta to report
    tick(16);
    engine.removeTickable(tickable);

    tick(32);

    expect(seen.length).toBe(1);
  });

  it('initialises a scene when it is set', () => {
    const scene = stubScene('hub');

    engine.setScene(scene);

    expect(scene.initialised).toBe(1);
  });

  it('disposes the previous scene before swapping in a new one', () => {
    const first = stubScene('first');
    engine.setScene(first);

    engine.setScene(stubScene('second'));

    expect(first.disposed).toBe(1);
  });

  it('does not render while paused', () => {
    tick(0);
    const before = renderer.renders;

    engine.setPaused(true);
    tick(16);
    tick(32);

    expect(renderer.renders).toBe(before);
  });

  it('picks the loop back up when unpaused', () => {
    engine.setPaused(true);
    tick(16);
    engine.setPaused(false);

    tick(32);

    expect(renderer.renders).toBeGreaterThan(0);
  });

  it('sizes the renderer and camera to the canvas', () => {
    engine.resize(800, 400);

    expect(renderer.width).toBe(800);
    expect(renderer.height).toBe(400);
    expect(engine.camera.aspect).toBeCloseTo(2, 6);
  });

  it('caps the pixel ratio at what the quality tier allows', () => {
    engine.resize(800, 400);

    expect(renderer.pixelRatio).toBeLessThanOrEqual(
      TestBed.inject(CapabilityService).settings().pixelRatioCap,
    );
  });

  it('reports frame times to the capability service', () => {
    const capability = TestBed.inject(CapabilityService);
    const sampled: number[] = [];
    capability.sampleFrame = (ms: number) => void sampled.push(ms);

    tick(0);
    tick(16);

    expect(sampled.at(-1)).toBeCloseTo(16, 3);
  });

  it('reports frame rate and GPU counts for the dev overlay', () => {
    tick(0);
    tick(20);

    const stats = engine.stats();
    expect(stats.fps).toBeCloseTo(50, 0);
    expect(stats.geometries).toBe(0);
    expect(stats.textures).toBe(0);
  });

  it('reports no frame rate before the first measured frame', () => {
    expect(engine.stats().fps).toBe(0);
  });

  it('stops the loop and releases the renderer on detach', () => {
    engine.detach();

    expect(renderer.loop).toBeNull();
    expect(renderer.disposed).toBe(true);
  });

  it('disposes the active scene on detach', () => {
    const scene = stubScene('hub');
    engine.setScene(scene);

    engine.detach();

    expect(scene.disposed).toBe(1);
  });

  it('hands the scene a context carrying the shared three scene and camera', () => {
    let seen: { scene: Scene; camera: unknown } | null = null;
    const scene = stubScene('hub');
    scene.init = (ctx) => void (seen = ctx);

    engine.setScene(scene);

    expect(seen!.scene).toBe(engine.scene);
    expect(seen!.camera).toBe(engine.camera);
  });
});

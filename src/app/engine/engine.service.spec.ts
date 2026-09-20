import { TestBed } from '@angular/core/testing';
import { Scene } from 'three';
import {
  CapabilityService,
  DEVICE_CAPABILITIES,
  QualitySettings,
  qualitySettings,
} from './capability.service';
import { ENGINE_MAX_FRAME_SECONDS, EngineService } from './engine.service';
import { RENDERER_FACTORY, RendererLike } from './renderer.factory';
import { BoxGeometry, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { Interactable } from './interaction/interactable';
import { Collider, HeightField } from './player/collision';
import { PLAYER_EYE_HEIGHT } from './player/player-controller';
import { BOOM_HEIGHT, BOOM_LENGTH } from './player/third-person-rig';
import { WorldScene } from './world-object';
import { CAPABLE } from './testing/world-context';

class StubRenderer implements RendererLike {
  loop: ((time: number) => void) | null = null;
  renders = 0;
  disposed = false;
  width = 0;
  height = 0;
  pixelRatio = 1;
  readonly domElement = document.createElement('canvas');
  readonly qualities: QualitySettings[] = [];
  readonly info = { memory: { geometries: 0, textures: 0 } };
  renderListsDisposed = 0;
  readonly renderLists = { dispose: () => void this.renderListsDisposed++ };

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
  setQuality(quality: QualitySettings) {
    this.qualities.push(quality);
  }
  render() {
    this.renders++;
  }
  dispose() {
    this.disposed = true;
  }
}

const FLAT: HeightField = { heightAt: () => 0 };

function stubScene(id: string, interactables: Interactable[] = [], colliders: Collider[] = []) {
  const scene: WorldScene & { initialised: number; disposed: number; updates: number[] } = {
    id,
    ground: FLAT,
    colliders,
    interactables,
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

  it('clears the render lists when the scene is swapped (§2)', () => {
    engine.setScene(stubScene('first'));
    engine.setScene(stubScene('second'));

    expect(renderer.renderListsDisposed).toBeGreaterThanOrEqual(1);
  });

  it('forgets the nearby listener on detach so a dead page is not retained', () => {
    engine.onNearbyChange = () => undefined;

    engine.detach();

    expect(engine.onNearbyChange).toBeNull();
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

  it('re-applies the pixel ratio cap when the quality tier changes', () => {
    engine.resize(800, 400);
    TestBed.inject(CapabilityService).override('low');

    engine.refreshQuality();

    expect(renderer.pixelRatio).toBeLessThanOrEqual(1);
    expect(renderer.width).toBe(800);
  });

  it('hands a changed quality tier to the renderer', () => {
    TestBed.inject(CapabilityService).override('low');

    engine.refreshQuality();

    expect(renderer.qualities.at(-1)).toEqual(qualitySettings('low'));
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

  it('counts the geometries and textures alive in the scene graph', () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture, emissiveMap: texture });
    engine.scene.add(new Mesh(geometry, material), new Mesh(geometry, new MeshStandardMaterial()));

    const stats = engine.stats();

    expect(stats.sceneGeometries).toBe(1);
    expect(stats.sceneTextures).toBe(1);
  });

  it('counts every rendered frame', () => {
    tick(0);
    tick(16);
    tick(32);

    expect(engine.stats().frames).toBe(3);
  });

  it('stops counting frames while paused', () => {
    tick(0);
    engine.setPaused(true);
    const before = engine.stats().frames;

    tick(16);
    tick(32);

    expect(engine.stats().frames).toBe(before);
  });

  it('stays paused while the tab is hidden, even if the app clears its own pause', () => {
    tick(0);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    engine.setPaused(false);
    const before = renderer.renders;
    tick(16);
    tick(32);

    expect(renderer.renders).toBe(before);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  it('resumes once both the tab and the app agree', () => {
    tick(0);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    engine.setPaused(true);

    engine.setPaused(false);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const before = renderer.renders;
    tick(16);

    expect(renderer.renders).toBe(before + 1);
  });

  it('throttles the ambient hub to the requested frame rate', () => {
    tick(0);
    tick(16);
    const before = renderer.renders;

    engine.setThrottle(15); // ~66 ms between frames
    tick(32);
    tick(48);

    expect(renderer.renders).toBe(before);
  });

  it('renders again once the throttle interval has passed', () => {
    tick(0);
    tick(16);
    const before = renderer.renders;

    engine.setThrottle(15);
    tick(120);

    expect(renderer.renders).toBe(before + 1);
  });

  it('goes back to full rate when the throttle is lifted', () => {
    tick(0);
    engine.setThrottle(15);
    tick(16);
    engine.setThrottle(null);
    const before = renderer.renders;

    tick(32);

    expect(renderer.renders).toBe(before + 1);
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

  describe('camera rig', () => {
    it('starts in third person, on a boom behind the player', () => {
      tick(0);
      tick(16);

      expect(engine.camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT + BOOM_HEIGHT, 6);
      expect(engine.camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('moves the camera onto the head when the view mode changes mid-play', () => {
      tick(0);
      tick(16);

      engine.setViewMode('first');
      tick(32);

      expect(engine.camera.position.toArray()).toEqual(engine.player.position.toArray());
    });

    it('goes back to the boom when the view mode changes back', () => {
      engine.setViewMode('first');
      tick(0);
      tick(16);

      engine.setViewMode('third');
      tick(32);

      expect(engine.camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('places the boom on a switch back instead of easing it in from where it last stood', () => {
      tick(0);
      tick(16);

      engine.setViewMode('first');
      // A stride walked in first person, well under the distance the rig reads as a teleport.
      engine.player.position.z -= 1;
      tick(32);

      engine.setViewMode('third');
      tick(48);

      expect(engine.camera.position.z).toBeCloseTo(engine.player.position.z + BOOM_LENGTH, 6);
    });

    it('hands the rig the world the player walks through, so the boom clears it', () => {
      // A wall straight behind the spawn: the boom has to stop short of it.
      engine.setScene(
        stubScene('hub', [], [{ kind: 'aabb', minX: -5, maxX: 5, minZ: 2, maxZ: 3 }]),
      );

      tick(0);
      tick(16);

      expect(engine.camera.position.z).toBeLessThan(2);
    });
  });

  describe('interaction', () => {
    const portal: Interactable = {
      id: 'portal',
      position: new Vector3(0, 0, -2),
      radius: 3,
      prompt: 'Enter',
      onInteract: () => undefined,
    };

    it('reports the interactable the player is facing, once', () => {
      const seen: (Interactable | null)[] = [];
      engine.onNearbyChange = (nearby) => seen.push(nearby);
      engine.setScene(stubScene('hub', [portal]));

      tick(0);
      tick(16);
      tick(32);

      expect(seen).toEqual([portal]);
    });

    it('forgets the pick when the scene is swapped', () => {
      const seen: (Interactable | null)[] = [];
      engine.onNearbyChange = (nearby) => seen.push(nearby);
      engine.setScene(stubScene('hub', [portal]));
      tick(0);
      tick(16);

      engine.setScene(stubScene('other'));

      expect(seen).toEqual([portal, null]);
    });
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

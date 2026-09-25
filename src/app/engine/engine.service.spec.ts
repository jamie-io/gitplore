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
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Texture, Vector3 } from 'three';
import { Interactable } from './interaction/interactable';
import { Collider, HeightField } from './player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from './player/player-controller';
import { PlayerVisual } from './player/player-visual';
import { BOOM_HEIGHT, BOOM_LENGTH } from './player/third-person-rig';
import { WorldScene } from './world-object';
import { CAPABLE } from './testing/world-context';
import { arrivalShot, momentShot } from './camera/camera-shot';
import { planGlide } from './stations/glide';

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

/** Records what the engine does to a world's avatar, without a figure to build. */
class StubAvatar implements PlayerVisual {
  readonly object = new Object3D();
  readonly synced: number[] = [];
  readonly modes: boolean[] = [];

  sync(_player: PlayerController, dt: number): void {
    this.synced.push(dt);
  }
  setFirstPerson(on: boolean): void {
    this.modes.push(on);
  }
  dispose(): void {
    // The scene that built the figure disposes it; the engine never does.
  }
}

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

/** A world that carries an avatar, as every real scene does. */
function stubSceneWithAvatar(id = 'hub') {
  const avatar = new StubAvatar();
  return Object.assign(stubScene(id), { avatar });
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

  it('counts textures held by material shader uniforms as scene-owned', () => {
    const texture = new Texture();
    const material = new MeshStandardMaterial();
    material.userData['uniforms'] = { slopMap: { value: texture } };
    engine.scene.add(new Mesh(new BoxGeometry(), material));

    expect(engine.stats().sceneTextures).toBe(1);
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

    it('poses the avatar with the same frame it moved the player in', () => {
      const scene = stubSceneWithAvatar();
      engine.setScene(scene);

      tick(0);
      tick(20);

      expect(scene.avatar.synced.at(-1)).toBeCloseTo(0.02, 6);
    });

    it('tells a freshly built world which view is open', () => {
      engine.setViewMode('first');
      const scene = stubSceneWithAvatar();

      engine.setScene(scene);

      // Built per world and never shared, so each new figure has to be told again.
      expect(scene.avatar.modes).toEqual([true]);
    });

    it('hides the body when the view moves into the head, and shows it again', () => {
      const scene = stubSceneWithAvatar();
      engine.setScene(scene);

      engine.setViewMode('first');
      engine.setViewMode('third');

      expect(scene.avatar.modes).toEqual([false, true, false]);
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

  describe('camera shots', () => {
    const overview = { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 }, fov: 50 };
    const press = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const release = (code: string) => document.dispatchEvent(new KeyboardEvent('keyup', { code }));

    /** Ticks from `from` to `to` milliseconds in `step` ms frames, both ends included. */
    const run = (from: number, to: number, step = 16) => {
      for (let time = from; time <= to; time += step) {
        tick(time);
      }
    };

    it('reports an arrival as it starts', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));

      engine.playShot(arrivalShot(overview, false));

      expect(seen).toEqual(['arrival']);
    });

    it('places the camera on the shot after the rig has placed it', () => {
      engine.playShot(arrivalShot(overview, false));

      tick(0);
      tick(16);

      expect(engine.camera.position.toArray()).toEqual([0, 24, 36]);
      expect(engine.camera.fov).toBe(50);
    });

    it('reports the end once, when the timeline runs out, and hands the camera back', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));

      run(0, 3200);

      expect(seen).toEqual(['arrival', null]);
      expect(engine.camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT + BOOM_HEIGHT, 6);
      expect(engine.camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('stays silent while the shot runs', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));

      run(0, 2000);

      expect(seen).toEqual(['arrival']);
    });

    it('restores the rig field of view and its projection after the shot', () => {
      const fov = engine.camera.fov;
      const projection = engine.camera.projectionMatrix.clone();
      engine.playShot(arrivalShot(overview, false));

      run(0, 2000);
      expect(engine.camera.fov).not.toBe(fov);
      run(2016, 3200);

      expect(engine.camera.fov).toBe(fov);
      expect(engine.camera.projectionMatrix.equals(projection)).toBe(true);
    });

    it('skips to the rig within 0.3 s when the player moves', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));
      run(0, 320);
      expect(engine.camera.position.y).toBe(24);

      press('KeyW');
      run(336, 336 + 300);
      release('KeyW');

      expect(seen).toEqual(['arrival', null]);
      expect(engine.camera.fov).toBe(70);
    });

    it('eases a skip rather than cutting it', () => {
      engine.playShot(arrivalShot(overview, false));
      run(0, 320);

      press('Space');
      tick(336);
      release('Space');

      // Part of the way down from the overview, but nowhere near the shoulder yet.
      expect(engine.camera.position.y).toBeLessThan(24);
      expect(engine.camera.position.y).toBeGreaterThan(12);
    });

    it('skips at once under reduced motion', () => {
      TestBed.inject(CapabilityService).overrideReducedMotion(true);
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(momentShot(overview, true));
      run(0, 320);

      engine.skipShot();

      expect(seen).toEqual(['moment', null]);
    });

    it('a moment played while W is held keeps playing until a new input', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      press('KeyW');
      run(0, 160);

      // Walked through the arch: the moment starts with the key already down.
      engine.playShot(momentShot(overview, false));
      run(176, 176 + 2000);
      expect(seen).toEqual(['moment']);

      // Letting go and pressing again is a new input, and that one skips.
      release('KeyW');
      tick(2192);
      press('KeyW');
      run(2208, 2208 + 320);
      release('KeyW');

      expect(seen).toEqual(['moment', null]);
    });

    it('keeps a held-key moment for its whole hold under reduced motion', () => {
      TestBed.inject(CapabilityService).overrideReducedMotion(true);
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      press('KeyW');
      press('Space');
      run(0, 160);

      engine.playShot(momentShot(overview, true));
      run(176, 176 + 2400);
      release('KeyW');
      release('Space');

      expect(seen).toEqual(['moment']);
    });

    it('skips a shot on movement that starts after it began', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      press('KeyW');
      run(0, 160);
      engine.playShot(momentShot(overview, false));
      tick(176);

      press('KeyD');
      run(192, 192 + 320);
      release('KeyD');
      release('KeyW');

      expect(seen).toEqual(['moment', null]);
    });

    it('does not skip on looking around alone', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));

      tick(0);
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40 }));
      tick(16);

      expect(seen).toEqual(['arrival']);
    });

    it('stops a shot at once on endShot', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));
      run(0, 320);

      engine.endShot();

      expect(seen).toEqual(['arrival', null]);
      expect(engine.camera.fov).toBe(70);
      tick(336);
      expect(engine.camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('lets a new shot replace a running one', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));
      run(0, 320);

      engine.playShot(momentShot({ ...overview, fov: 40 }, false));
      run(336, 336 + 2700);

      expect(seen).toEqual(['arrival', 'moment', null]);
      // The rig's own field of view, not the arrival's, is what comes back.
      expect(engine.camera.fov).toBe(70);
    });

    it('ignores skip and end when no shot runs', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));

      engine.skipShot();
      engine.endShot();

      expect(seen).toEqual([]);
    });

    it('stops listening once a listener unsubscribes', () => {
      const seen: (string | null)[] = [];
      const off = engine.onShotChange((kind) => seen.push(kind));
      off();

      engine.playShot(arrivalShot(overview, false));

      expect(seen).toEqual([]);
    });

    it('ends a running shot when the world is swapped', () => {
      const seen: (string | null)[] = [];
      engine.onShotChange((kind) => seen.push(kind));
      engine.playShot(arrivalShot(overview, false));

      engine.setScene(stubScene('other'));

      expect(seen).toEqual(['arrival', null]);
    });
  });

  describe('glides', () => {
    const press = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const release = (code: string) => document.dispatchEvent(new KeyboardEvent('keyup', { code }));
    const run = (from: number, to: number, step = 16) => {
      for (let time = from; time <= to; time += step) {
        tick(time);
      }
    };
    /** A wall across the way north, with no top to step onto. */
    const WALL: Collider = { kind: 'aabb', minX: -5, maxX: 5, minZ: -5.5, maxZ: -4.5 };
    const north = () =>
      planGlide(
        [
          { x: 0, z: 0 },
          { x: 0, z: -10 },
        ],
        Math.PI,
      )!;

    it('moves the player along the glide, straight through what it would bump into', () => {
      engine.setScene(stubScene('hub', [], [WALL]));
      tick(0);
      tick(16);
      engine.glide(north());

      expect(engine.gliding()).toBe(true);
      tick(32);
      expect(engine.player.position.z).toBeLessThan(0);
      run(48, 48 + 800);

      expect(engine.gliding()).toBe(false);
      expect(engine.player.position.x).toBeCloseTo(0, 6);
      expect(engine.player.position.z).toBeCloseTo(-10, 6);
      expect(engine.player.yaw).toBe(Math.PI);
    });

    it('stands the player on the ground and the walkable tops along the way', () => {
      const deck: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: -12, maxZ: -2, top: 0.3 };
      engine.setScene(stubScene('hub', [], [deck]));
      tick(0);
      engine.glide(north());

      run(16, 16 + 800);

      expect(engine.player.position.y).toBeCloseTo(0.3 + PLAYER_EYE_HEIGHT, 6);
    });

    it('still runs the world, the avatar and the rig while gliding', () => {
      const scene = stubSceneWithAvatar();
      engine.setScene(scene);
      tick(0);
      engine.glide(north());
      const updates = scene.updates.length;
      const synced = scene.avatar.synced.length;

      tick(16);
      tick(32);

      expect(scene.updates.length).toBe(updates + 2);
      expect(scene.avatar.synced.length).toBe(synced + 2);
      // The boom follows the player north.
      expect(engine.camera.position.z).toBeLessThan(BOOM_LENGTH);
    });

    it('cancels in place on movement', () => {
      engine.setScene(stubScene('hub'));
      tick(0);
      engine.glide(north());
      run(16, 320);
      const z = engine.player.position.z;
      expect(z).toBeLessThan(-0.5);
      expect(z).toBeGreaterThan(-9.5);

      press('KeyD');
      tick(336);
      release('KeyD');

      expect(engine.gliding()).toBe(false);
      run(352, 352 + 800);
      // Walked a little to the side, never on to the stand.
      expect(engine.player.position.z).toBeGreaterThan(-9.5);
    });

    it('cancels in place on cancelGlide', () => {
      engine.setScene(stubScene('hub'));
      tick(0);
      engine.glide(north());
      run(16, 320);

      engine.cancelGlide();
      const z = engine.player.position.z;
      run(336, 336 + 800);

      expect(engine.gliding()).toBe(false);
      expect(engine.player.position.z).toBeCloseTo(z, 6);
    });

    it('lets a new glide replace a running one', () => {
      engine.setScene(stubScene('hub'));
      tick(0);
      engine.glide(north());
      run(16, 320);

      const { x, z } = engine.player.position;
      engine.glide(
        planGlide(
          [
            { x, z },
            { x: 6, z },
          ],
          0,
        )!,
      );
      run(336, 336 + 800);

      expect(engine.player.position.x).toBeCloseTo(6, 6);
      expect(engine.player.position.z).toBeCloseTo(z, 6);
    });

    it('teleports straight to the stand under reduced motion', () => {
      TestBed.inject(CapabilityService).overrideReducedMotion(true);
      engine.setScene(stubScene('hub', [], [WALL]));
      tick(0);

      engine.glide(north());

      expect(engine.gliding()).toBe(false);
      expect(engine.player.position.x).toBeCloseTo(0, 6);
      expect(engine.player.position.z).toBeCloseTo(-10, 6);
      expect(engine.player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 6);
      expect(engine.player.yaw).toBe(Math.PI);
    });

    it('stops a glide when the world is swapped', () => {
      engine.setScene(stubScene('hub'));
      tick(0);
      engine.glide(north());

      engine.setScene(stubScene('other'));

      expect(engine.gliding()).toBe(false);
    });

    it('keeps the player where the glide left them once it is over', () => {
      engine.setScene(stubScene('hub'));
      tick(0);
      engine.glide(north());
      run(16, 16 + 800);

      run(832, 832 + 500);

      expect(engine.player.position.z).toBeCloseTo(-10, 6);
      expect(engine.player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 6);
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

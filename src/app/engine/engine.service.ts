import { InjectionToken, NgZone, Service, inject } from '@angular/core';
import { BufferGeometry, PerspectiveCamera, Scene, Texture } from 'three';
import { AssetService } from './asset.service';
import { CapabilityService } from './capability.service';
import { RENDERER_FACTORY, RendererLike } from './renderer.factory';
import { ViewMode } from '../shared/view-mode';
import { CameraRig, FirstPersonRig } from './player/camera-rig';
import { Collider, HeightField } from './player/collision';
import { MoveIntent, PlayerController } from './player/player-controller';
import { CameraShot, SKIP_SECONDS, ShotKind, blendCamera, smoothstep } from './camera/camera-shot';
import { ThirdPersonRig } from './player/third-person-rig';
import { InputService } from './input.service';
import { Interactable } from './interaction/interactable';
import { InteractionSystem } from './interaction/interaction.system';
import { Tickable, WorldContext, WorldScene } from './world-object';
import { disposeObject3D, forEachResource } from './dispose';

/** A frame longer than this is treated as a hitch, not as elapsed game time. */
export const ENGINE_MAX_FRAME_SECONDS = 0.05;

const FLAT_GROUND: HeightField = { heightAt: () => 0 };
const NO_COLLIDERS: readonly Collider[] = [];

/**
 * Below this a skipped shot's weight is invisible, so the shot counts as over. Without it a skip
 * summed from frame times could stop a hair short of `SKIP_SECONDS` and linger one frame more.
 */
const SKIP_DONE = 1e-6;

export interface EngineStats {
  readonly fps: number;
  /** GPU-resident counts from `renderer.info.memory`; a geometry counts once it has been drawn. */
  readonly geometries: number;
  readonly textures: number;
  readonly frames: number;
  /** Unique geometries and textures reachable from the scene graph, whatever the GPU holds. */
  readonly sceneGeometries: number;
  readonly sceneTextures: number;
}

/** The "nothing measured yet" reading, so stubs and initial values need not respell the shape. */
export const EMPTY_ENGINE_STATS: EngineStats = {
  fps: 0,
  geometries: 0,
  textures: 0,
  frames: 0,
  sceneGeometries: 0,
  sceneTextures: 0,
};

/**
 * Owns the renderer, the camera, the active scene and the render loop
 * (IMPLEMENTATION_PLAN.md §2). It knows nothing about projects or Angular components.
 */
@Service()
export class EngineService {
  private readonly zone = inject(NgZone);
  private readonly capability = inject(CapabilityService);
  private readonly assets = inject(AssetService);
  private readonly input = inject(InputService);
  private readonly rendererFactory = inject(RENDERER_FACTORY);

  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, 0.1, 500);
  readonly player = new PlayerController();

  private readonly rigs: Record<ViewMode, CameraRig> = {
    first: new FirstPersonRig(this.camera),
    third: new ThirdPersonRig(this.camera),
  };
  /** Third person by default, matching the stored setting the UI pushes in below. */
  private viewMode: ViewMode = 'third';
  private rig: CameraRig = this.rigs[this.viewMode];
  private readonly interaction = new InteractionSystem();
  private readonly tickables = new Set<Tickable>();

  /** The scripted camera move blended over the rig, if one is running. */
  private shot: CameraShot | null = null;
  private shotTime = 0;
  /** Seconds since the shot was skipped, or `null` while it plays out in full. */
  private skipTime: number | null = null;
  /** The rig's field of view when the shot began; each frame's blend starts from it again. */
  private rigFov = 0;
  /** The field of view the projection matrix was last built with during the shot. */
  private projectedFov = 0;
  private readonly shotListeners = new Set<(kind: ShotKind | null) => void>();

  /** Fires only when the interactable in front of the player changes (§2), never per frame. */
  onNearbyChange: ((nearby: Interactable | null) => void) | null = null;

  private renderer: RendererLike | null = null;
  private world: WorldScene | null = null;
  private detachInput: (() => void) | null = null;
  private teardown: (() => void)[] = [];

  private lastTime: number | null = null;
  private lastFrameMs = 0;
  private renderedFrames = 0;
  private size = { width: 0, height: 0 };

  /** Independent reasons to stop drawing; the loop runs only when none of them apply. */
  private readonly pauseReasons = { app: false, hidden: false, offscreen: false };

  /** Minimum milliseconds between rendered frames; 0 means every frame. */
  private minFrameMs = 0;
  private lastRenderTime = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.renderer = this.rendererFactory(canvas, this.capability.settings());
    this.detachInput = this.input.attach(canvas);
    this.interaction.onChange = (nearby) => this.onNearbyChange?.(nearby);

    this.watchVisibility();
    this.watchCanvasSize(canvas);
    this.watchCanvasVisibility(canvas);

    // Zoneless already keeps this off Angular's radar; running outside is belt and braces.
    this.zone.runOutsideAngular(() => {
      this.renderer?.setAnimationLoop((time) => this.tick(time));
    });
  }

  detach(): void {
    this.renderer?.setAnimationLoop(null);
    this.endShot();
    this.world?.dispose();
    this.world = null;

    disposeObject3D(this.scene);
    this.renderer?.renderLists.dispose();
    this.renderer?.dispose();
    this.renderer = null;

    this.detachInput?.();
    this.detachInput = null;
    this.interaction.reset();
    this.onNearbyChange = null;
    this.teardown.forEach((off) => off());
    this.teardown = [];
    this.tickables.clear();
    this.pauseReasons.app = false;
    this.pauseReasons.hidden = false;
    this.pauseReasons.offscreen = false;
    this.lastTime = null;
    this.lastFrameMs = 0;
    this.renderedFrames = 0;
    this.minFrameMs = 0;
  }

  setScene(world: WorldScene): void {
    // A shot frames the world it was made for; carried into the next one it would frame nothing.
    this.endShot();
    this.world?.dispose();
    // Every WorldObject detaches itself on dispose; clearing is the safety net for one that forgets.
    this.scene.clear();
    this.renderer?.renderLists.dispose();
    this.interaction.reset();
    this.world = world;
    world.init(this.context());
    // The avatar is built with its world and never shared between two, so the view the visitor
    // chose has to be applied again to each new figure.
    world.avatar?.setFirstPerson(this.viewMode === 'first');
  }

  /** What the player is currently close to and facing. */
  get nearby(): Interactable | null {
    return this.interaction.nearby;
  }

  addTickable(tickable: Tickable): void {
    this.tickables.add(tickable);
  }

  removeTickable(tickable: Tickable): void {
    this.tickables.delete(tickable);
  }

  /**
   * Drops the ambient hub to a lower frame rate while an overlay covers it (§3). `null` restores
   * the display rate.
   */
  setThrottle(fps: number | null): void {
    this.minFrameMs = fps === null ? 0 : 1000 / fps;
  }

  /** The application's own reason to pause — a menu, an overlay on the weakest tier. */
  setPaused(paused: boolean): void {
    this.pause('app', paused);
  }

  private pause(reason: keyof typeof this.pauseReasons, paused: boolean): void {
    this.pauseReasons[reason] = paused;
    // Forget the timestamp, so resuming does not book the pause as elapsed time.
    this.lastTime = null;
  }

  private get paused(): boolean {
    return this.pauseReasons.app || this.pauseReasons.hidden || this.pauseReasons.offscreen;
  }

  /**
   * Picks the rig that places the camera. The visitor's choice lives in `SettingsStore`, which the
   * engine may not reach into, so the world page pushes it here the way the quality tier travels.
   */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) {
      return;
    }

    this.viewMode = mode;
    this.rig = this.rigs[mode];
    // First person hides the body without taking its shadow away, which is the whole point of
    // asking the avatar rather than simply not drawing it.
    this.world?.avatar?.setFirstPerson(mode === 'first');
    // The rig coming in last watched the player wherever the view was switched away from it. On a
    // key press that would be one visible swing of the camera, so it is placed rather than eased.
    this.rig.reset();
  }

  /**
   * Blends `shot` over the rig from the next frame on, replacing any shot already running. The
   * rig keeps following the player underneath, so wherever the shot ends the camera is handed
   * back without a jump.
   */
  playShot(shot: CameraShot): void {
    // A replaced shot has bent the field of view; the rig's own is the one to remember.
    this.restoreFov();
    this.shot = shot;
    this.shotTime = 0;
    this.skipTime = null;
    this.rigFov = this.camera.fov;
    this.projectedFov = this.camera.fov;
    this.notifyShot(shot.kind);
  }

  /**
   * Eases the running shot out over `SKIP_SECONDS`, or ends it at once under reduced motion. The
   * engine skips on its own when the player moves or jumps; other keys are for the caller to map.
   */
  skipShot(): void {
    if (!this.shot) {
      return;
    }
    if (this.capability.reducedMotion()) {
      this.endShot();
      return;
    }
    this.skipTime ??= 0;
  }

  /** Stops the running shot at once, without easing — for a world swap or a restart. */
  endShot(): void {
    if (!this.shot) {
      return;
    }
    this.restoreFov();
    this.shot = null;
    this.skipTime = null;
    this.notifyShot(null);
  }

  /**
   * Hears when a shot starts (with its kind) and when it ends (with `null`), never per frame, so
   * the HUD can make way for it. Returns the unsubscribe function.
   */
  onShotChange(listener: (kind: ShotKind | null) => void): () => void {
    this.shotListeners.add(listener);
    return () => this.shotListeners.delete(listener);
  }

  /** Re-applies the current quality settings to the renderer, e.g. after a tier change. */
  refreshQuality(): void {
    this.renderer?.setQuality(this.capability.settings());
    this.resize(this.size.width, this.size.height);
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) {
      return;
    }
    this.size = { width, height };

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.capability.settings().pixelRatioCap),
    );
    this.renderer?.setSize(width, height, false);
  }

  /**
   * Frame rate, live GPU resource counts and the number of frames drawn since attach, for the
   * stats overlay in the HUD. `frames` is what lets a test prove the loop really stopped.
   */
  stats(): EngineStats {
    const memory = this.renderer?.info.memory ?? { geometries: 0, textures: 0 };
    const alive = countSceneResources(this.scene);
    return {
      fps: this.lastFrameMs > 0 ? 1000 / this.lastFrameMs : 0,
      geometries: memory.geometries,
      textures: memory.textures,
      frames: this.renderedFrames,
      sceneGeometries: alive.geometries,
      sceneTextures: alive.textures,
    };
  }

  private tick(time: number): void {
    if (!this.renderer || this.paused) {
      return;
    }

    const previous = this.lastTime;
    if (previous !== null && time - this.lastRenderTime < this.minFrameMs) {
      return;
    }

    this.lastTime = time;
    this.lastRenderTime = time;
    this.renderedFrames++;
    if (previous === null) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const frameMs = time - previous;
    this.lastFrameMs = frameMs;
    this.capability.sampleFrame(frameMs);
    const dt = Math.min(frameMs / 1000, ENGINE_MAX_FRAME_SECONDS);

    const ground = this.world?.ground ?? FLAT_GROUND;
    const colliders = this.world?.colliders ?? NO_COLLIDERS;
    const intent = this.input.consumeIntent(dt);
    this.player.update(dt, intent, ground, colliders);
    // A boom needs the same world the player walks through, or it would hang inside the scenery.
    this.rig.sync(this.player, {
      dt,
      ground,
      colliders,
      reducedMotion: this.capability.reducedMotion(),
    });
    // Over the pose the rig has just set, and before anything that reads the camera this frame.
    this.updateShot(dt, intent);
    // After the camera, because the figure is a consequence of the player exactly as the camera is,
    // and both have to be reading the same frame's position.
    this.world?.avatar?.sync(this.player, dt);
    this.interaction.update(this.player, this.world?.interactables ?? []);

    this.world?.update(dt, this.context());
    this.tickables.forEach((tickable) => tickable.update(dt));

    this.renderer.render(this.scene, this.camera);
  }

  private updateShot(dt: number, intent: MoveIntent): void {
    if (this.shot && (intent.forward !== 0 || intent.strafe !== 0 || intent.jump)) {
      this.skipShot();
    }
    const shot = this.shot;
    if (!shot) {
      return;
    }

    this.shotTime += dt;
    let skip = 1;
    if (this.skipTime !== null) {
      this.skipTime += dt;
      skip = 1 - smoothstep(this.skipTime / SKIP_SECONDS);
    }
    if (this.shotTime >= shot.duration || skip <= SKIP_DONE) {
      this.endShot();
      return;
    }

    this.camera.fov = this.rigFov;
    blendCamera(this.camera, shot.pose, shot.weight(this.shotTime) * skip);
    // A blend at weight 0 leaves the field of view where the rig has it but does not rebuild the
    // projection, which may still hold the last frame's.
    if (this.camera.fov === this.rigFov && this.projectedFov !== this.rigFov) {
      this.camera.updateProjectionMatrix();
    }
    this.projectedFov = this.camera.fov;
  }

  /** Hands the rig its own field of view back, if a shot had bent it. */
  private restoreFov(): void {
    if (this.shot && this.camera.fov !== this.rigFov) {
      this.camera.fov = this.rigFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private notifyShot(kind: ShotKind | null): void {
    this.shotListeners.forEach((listener) => listener(kind));
  }

  private context(): WorldContext {
    return {
      scene: this.scene,
      camera: this.camera,
      player: this.player,
      quality: this.capability.settings(),
      assets: this.assets,
    };
  }

  private watchVisibility(): void {
    const onChange = () => this.pause('hidden', document.hidden);
    document.addEventListener('visibilitychange', onChange);
    this.teardown.push(() => document.removeEventListener('visibilitychange', onChange));
  }

  private watchCanvasSize(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      this.resize(box.width, box.height);
    });
    observer.observe(canvas);
    this.teardown.push(() => observer.disconnect());
  }

  private watchCanvasVisibility(canvas: HTMLCanvasElement): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) =>
      this.pause('offscreen', !entry.isIntersecting),
    );
    observer.observe(canvas);
    this.teardown.push(() => observer.disconnect());
  }
}

/** What the scene graph currently references; the yardstick GPU memory is compared against. */
function countSceneResources(scene: Scene): { geometries: number; textures: number } {
  const geometries = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  forEachResource(scene, {
    geometry: (geometry) => geometries.add(geometry),
    material: (material) => {
      const visited = new Set<object>();
      collectTextures(material.userData, textures, visited);
      collectTextures((material as MaterialWithUniforms).uniforms, textures, visited);
    },
    texture: (texture) => textures.add(texture),
  });
  return { geometries: geometries.size, textures: textures.size };
}

interface MaterialWithUniforms {
  readonly uniforms?: unknown;
}

/** Counts textures held by shader uniforms, including uniforms kept in material userData. */
function collectTextures(value: unknown, textures: Set<Texture>, visited: Set<object>): void {
  if (value instanceof Texture) {
    textures.add(value);
    return;
  }
  if (value === null || typeof value !== 'object' || visited.has(value)) {
    return;
  }
  visited.add(value);
  Object.values(value).forEach((entry) => collectTextures(entry, textures, visited));
}

/**
 * Indirection so UI components and their tests can stand in for the engine without pulling Three
 * into the test bed (IMPLEMENTATION_PLAN.md §9).
 */
export const ENGINE = new InjectionToken<EngineService>('ENGINE', {
  providedIn: 'root',
  factory: () => inject(EngineService),
});

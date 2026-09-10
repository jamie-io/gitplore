import { InjectionToken, NgZone, Service, inject } from '@angular/core';
import { BufferGeometry, PerspectiveCamera, Scene, Texture } from 'three';
import { AssetService } from './asset.service';
import { CapabilityService } from './capability.service';
import { RENDERER_FACTORY, RendererLike } from './renderer.factory';
import { FirstPersonRig } from './player/camera-rig';
import { HeightField } from './player/collision';
import { PlayerController } from './player/player-controller';
import { InputService } from './input.service';
import { Interactable } from './interaction/interactable';
import { InteractionSystem } from './interaction/interaction.system';
import { Tickable, WorldContext, WorldScene } from './world-object';
import { disposeObject3D, forEachResource } from './dispose';

/** A frame longer than this is treated as a hitch, not as elapsed game time. */
export const ENGINE_MAX_FRAME_SECONDS = 0.05;

const FLAT_GROUND: HeightField = { heightAt: () => 0 };

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

  private readonly rig = new FirstPersonRig(this.camera);
  private readonly interaction = new InteractionSystem();
  private readonly tickables = new Set<Tickable>();

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
    this.world?.dispose();
    // Every WorldObject detaches itself on dispose; clearing is the safety net for one that forgets.
    this.scene.clear();
    this.renderer?.renderLists.dispose();
    this.interaction.reset();
    this.world = world;
    world.init(this.context());
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

  /** Re-applies the current quality settings to the renderer, e.g. after a tier change. */
  refreshQuality(): void {
    if (this.renderer) {
      this.renderer.shadowMap.enabled = this.capability.settings().shadows;
    }
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

    const intent = this.input.consumeIntent(dt);
    this.player.update(dt, intent, this.world?.ground ?? FLAT_GROUND, this.world?.colliders ?? []);
    this.rig.sync(this.player);
    this.interaction.update(this.player, this.world?.interactables ?? []);

    this.world?.update(dt, this.context());
    this.tickables.forEach((tickable) => tickable.update(dt));

    this.renderer.render(this.scene, this.camera);
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
    texture: (texture) => textures.add(texture),
  });
  return { geometries: geometries.size, textures: textures.size };
}

/**
 * Indirection so UI components and their tests can stand in for the engine without pulling Three
 * into the test bed (IMPLEMENTATION_PLAN.md §9).
 */
export const ENGINE = new InjectionToken<EngineService>('ENGINE', {
  providedIn: 'root',
  factory: () => inject(EngineService),
});

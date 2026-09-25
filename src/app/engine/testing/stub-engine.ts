import { TestBed } from '@angular/core/testing';
import { CameraShot, ShotKind } from '../camera/camera-shot';
import { EMPTY_ENGINE_STATS, EngineService } from '../engine.service';
import { InputService } from '../input.service';
import { PlayerController } from '../player/player-controller';
import { Glide } from '../stations/glide';
import { Tickable, WorldScene } from '../world-object';

/** The engine without a renderer: a page's or director's lifecycle and bridging are what is under test. */
export class StubEngine {
  attached = 0;
  detached = 0;
  world: WorldScene | null = null;
  /** Bumped by `setScene`, so a test can tell "built once" from "built twice". */
  scenesSet = 0;
  readonly player = new PlayerController();
  onNearbyChange: EngineService['onNearbyChange'] = null;
  readonly nearby = null;
  /** What the page hung on the render loop; there is no loop here to drive them. */
  readonly tickables = new Set<Tickable>();

  /** Every shot played, in order, and the one running now. */
  readonly shots: CameraShot[] = [];
  shot: CameraShot | null = null;
  skips = 0;
  private readonly shotListeners = new Set<(kind: ShotKind | null) => void>();

  /** Every glide asked for, in order, and the one running now. There is no loop to finish it. */
  readonly glides: Glide[] = [];
  activeGlide: Glide | null = null;

  stats() {
    return EMPTY_ENGINE_STATS;
  }

  playShot(shot: CameraShot): void {
    this.shots.push(shot);
    this.shot = shot;
    this.shotListeners.forEach((listener) => listener(shot.kind));
  }
  /** Counted, and otherwise left running: the real engine eases a skip out over a few frames. */
  skipShot(): void {
    this.skips++;
  }
  endShot(): void {
    if (!this.shot) {
      return;
    }
    this.shot = null;
    this.shotListeners.forEach((listener) => listener(null));
  }
  onShotChange(listener: (kind: ShotKind | null) => void): () => void {
    this.shotListeners.add(listener);
    return () => this.shotListeners.delete(listener);
  }

  glide(glide: Glide): void {
    this.glides.push(glide);
    this.activeGlide = glide;
  }
  cancelGlide(): void {
    this.activeGlide = null;
  }
  readonly gliding = (): boolean => this.activeGlide !== null;
  private detachInput: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.attached++;
    this.detachInput = TestBed.inject(InputService).attach(canvas);
  }
  detach(): void {
    this.detached++;
    this.detachInput?.();
    this.tickables.clear();
  }
  addTickable(tickable: Tickable): void {
    this.tickables.add(tickable);
  }
  removeTickable(tickable: Tickable): void {
    this.tickables.delete(tickable);
  }
  resize(): void {
    // no renderer
  }
  refreshQuality(): void {
    // no renderer
  }
  setScene(world: WorldScene): void {
    // As the real engine does: neither a shot nor a glide survives into another world.
    if (this.shot) {
      this.shot = null;
      this.shotListeners.forEach((listener) => listener(null));
    }
    this.activeGlide = null;
    // Landmarks are built in the scene's constructor; there is no renderer to init them for.
    this.world?.dispose();
    this.world = world;
    this.scenesSet++;
  }
  setThrottle(): void {
    // no renderer
  }
  setViewMode(): void {
    // no camera
  }
  setPaused(): void {
    // no renderer
  }
}

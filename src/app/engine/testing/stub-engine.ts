import { TestBed } from '@angular/core/testing';
import { EMPTY_ENGINE_STATS, EngineService } from '../engine.service';
import { InputService } from '../input.service';
import { PlayerController } from '../player/player-controller';
import { WorldScene } from '../world-object';

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

  stats() {
    return EMPTY_ENGINE_STATS;
  }
  private detachInput: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.attached++;
    this.detachInput = TestBed.inject(InputService).attach(canvas);
  }
  detach(): void {
    this.detached++;
    this.detachInput?.();
  }
  resize(): void {
    // no renderer
  }
  refreshQuality(): void {
    // no renderer
  }
  setScene(world: WorldScene): void {
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

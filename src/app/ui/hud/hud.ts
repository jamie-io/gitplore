import { Component, DestroyRef, computed, inject, isDevMode, signal } from '@angular/core';
import { ENGINE } from '@engine/engine.service';
import { WorldStore } from '../store/world.store';

/** Twice a second is enough to read, and keeps signal writes rare (IMPLEMENTATION_PLAN.md §2). */
const STATS_INTERVAL_MS = 500;

@Component({
  selector: 'app-hud',
  template: `
    @switch (store.phase()) {
      @case ('error') {
        <p class="notice" role="alert">
          Die Welt konnte nicht geladen werden: {{ store.errorMessage() }}
        </p>
      }
      @case ('loading') {
        <p class="notice" role="status">Lädt {{ store.loadProgress().label }} … {{ percent() }}%</p>
      }
      @case ('ready') {
        @if (!store.paused()) {
          <div class="crosshair" aria-hidden="true"></div>
        }
        <p class="area" aria-live="polite">{{ store.area() }}</p>
      }
    }

    @if (showStats()) {
      <p class="stats" aria-hidden="true">
        {{ fpsLabel() }} fps · {{ stats().geometries }} geo · {{ stats().textures }} tex
      </p>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      font:
        500 0.875rem/1.4 system-ui,
        sans-serif;
      color: #fff;
      text-shadow: 0 1px 3px rgb(0 0 0 / 70%);
    }
    .crosshair {
      position: absolute;
      inset: 50% auto auto 50%;
      inline-size: 6px;
      block-size: 6px;
      margin: -3px 0 0 -3px;
      border-radius: 50%;
      background: rgb(255 255 255 / 85%);
    }
    .notice,
    .area {
      position: absolute;
      inset-block-start: 1rem;
      inset-inline-start: 1rem;
      margin: 0;
    }
    .stats {
      position: absolute;
      inset-block-end: 0.75rem;
      inset-inline-start: 1rem;
      margin: 0;
      font-variant-numeric: tabular-nums;
      opacity: 0.7;
    }
  `,
})
export class Hud {
  protected readonly store = inject(WorldStore);

  private readonly engine = inject(ENGINE);

  protected readonly stats = signal({ fps: 0, geometries: 0, textures: 0 });
  protected readonly showStats = signal(isDevMode());

  protected readonly fpsLabel = computed(() => Math.round(this.stats().fps));

  protected readonly percent = computed(() => {
    const { loaded, total } = this.store.loadProgress();
    return total === 0 ? 0 : Math.round((loaded / total) * 100);
  });

  constructor() {
    if (!this.showStats()) {
      return;
    }

    // Read once up front so the overlay is not blank for the first half second.
    this.stats.set(this.engine.stats());

    const timer = setInterval(() => this.stats.set(this.engine.stats()), STATS_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}

import { Component, DestroyRef, computed, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AudioService } from '@engine/audio/audio.service';
import { EMPTY_ENGINE_STATS, ENGINE, EngineStats } from '@engine/engine.service';
import { WorldStore } from '../store/world.store';

/** Twice a second is enough to read, and keeps signal writes rare (IMPLEMENTATION_PLAN.md §2). */
const STATS_INTERVAL_MS = 500;

@Component({
  selector: 'app-hud',
  imports: [RouterLink],
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
        @if (store.inputMode() === 'world') {
          <div class="crosshair" aria-hidden="true"></div>
        }
        <!-- Also the arrival announcement for a scene change (spec §7); the director writes it. -->
        <p class="area" aria-live="polite">{{ store.area() }}</p>
        <p class="prompt" aria-live="polite">
          @if (store.demoHint(); as hint) {
            {{ hint }}
          } @else if (store.nearby(); as nearby) {
            <kbd>E</kbd> {{ nearby.prompt }}
          }
        </p>
        <nav class="tools" aria-label="Welt">
          <button type="button" data-role="menu" (click)="store.setMenuOpen(true)">
            Menü <kbd>M</kbd>
          </button>
          <button type="button" data-role="settings" (click)="store.setSettingsOpen(true)">
            Einstellungen
          </button>
          <a data-role="list" routerLink="/projects">Projekte als Liste</a>
        </nav>
      }
    }

    @if (showStats()) {
      <p
        class="stats"
        aria-hidden="true"
        [attr.data-frames]="stats().frames"
        [attr.data-geometries]="stats().geometries"
        [attr.data-textures]="stats().textures"
        [attr.data-scene-geometries]="stats().sceneGeometries"
        [attr.data-scene-textures]="stats().sceneTextures"
      >
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
    .prompt {
      position: absolute;
      inset-block-end: 18%;
      inset-inline: 0;
      margin: 0;
      text-align: center;
      font-size: 1.05rem;
    }
    .prompt:empty {
      display: none;
    }
    kbd {
      display: inline-block;
      min-inline-size: 1.4em;
      padding: 0.05em 0.4em;
      border: 1px solid rgb(255 255 255 / 70%);
      border-radius: 0.3em;
      background: rgb(0 0 0 / 70%);
      font: inherit;
      text-align: center;
      text-shadow: none;
    }
    .tools {
      position: absolute;
      inset-block-start: 1rem;
      inset-inline-end: 1rem;
      display: flex;
      gap: 0.75rem;
      align-items: center;
      pointer-events: auto;
    }
    .tools button,
    .tools a {
      padding: 0.4rem 0.8rem;
      border: 1px solid rgb(255 255 255 / 70%);
      border-radius: 999px;
      background: rgb(0 0 0 / 70%);
      color: inherit;
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .tools button:focus-visible,
    .tools a:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
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
  // Whether the world is audible, for the end-to-end suite: SwiftShader has no audio output, so
  // the state of the context is the only thing a browser test can check.
  host: { '[attr.data-audio]': 'audio.state()' },
})
export class Hud {
  protected readonly store = inject(WorldStore);
  protected readonly audio = inject(AudioService);

  private readonly engine = inject(ENGINE);

  protected readonly stats = signal<EngineStats>(EMPTY_ENGINE_STATS);

  /** Always on in development; `?stats=1` switches it on in a production build too. */
  protected readonly showStats = signal(
    isDevMode() || inject(ActivatedRoute).snapshot.queryParamMap.get('stats') === '1',
  );

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

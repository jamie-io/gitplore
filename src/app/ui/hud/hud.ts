import { Component, DestroyRef, computed, effect, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AudioService } from '@engine/audio/audio.service';
import { CapabilityService } from '@engine/capability.service';
import { EMPTY_ENGINE_STATS, ENGINE, EngineStats } from '@engine/engine.service';
import { HudPlate } from './hud-plate';
import { StationBar } from './station-bar';
import { WorldStore } from '../store/world.store';

/** Twice a second is enough to read, and keeps signal writes rare (IMPLEMENTATION_PLAN.md §2). */
const STATS_INTERVAL_MS = 500;
const ARRIVAL_BAR_DELAY_MS = 2600;
const BANNER_FADE_MS = 300;

@Component({
  selector: 'app-hud',
  imports: [HudPlate, RouterLink, StationBar],
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
        @if (store.worldStatus(); as status) {
          <p class="status" data-role="world-status">{{ status }}</p>
        }
        @if (store.stations().length > 0) {
          <app-station-bar
            [chips]="store.stations()"
            [hidden]="stationBarHidden()"
            (glide)="store.requestGlide($event)"
          />
        }
        <app-hud-plate [plate]="store.plate()" />
        <div class="toast-region" aria-live="polite" aria-atomic="true">
          @if (store.toast(); as toast) {
            @for (item of [toast]; track item.id) {
              <p class="toast" data-role="toast" [class.banner-active]="displayedBanner() !== null">
                {{ item.text }}
              </p>
            }
          }
        </div>
        @if (displayedBanner(); as banner) {
          <p
            class="moment-banner"
            data-role="moment-banner"
            [class.banner-enter]="bannerVisible()"
            [class.banner-leave]="!bannerVisible()"
          >
            {{ banner }}
          </p>
        }
        @if (store.shot() === 'arrival') {
          @if (store.pitch(); as pitch) {
            <div class="pitch" data-role="pitch">
              <h1>{{ pitch.title }}</h1>
              <p>{{ pitch.line }}</p>
            </div>
          }
        }
        <p class="prompt" [class.with-stations]="store.stations().length > 0" aria-live="polite">
          @if (store.capturePrompt(); as prompt) {
            <kbd>E</kbd> / <kbd>Esc</kbd> {{ prompt }}
          } @else if (store.demoHint(); as hint) {
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
    /*
     * The station bar's, the plate's, the toast's and the banner's colours, per environment; the
     * bar and the plate inherit them. The defaults are the Lichtung's amber on dark moss, and a
     * world with a palette of its own names itself in data-environment.
     */
    :host {
      --hud-accent: #e0a13c;
      --hud-accent-ink: #1a1408;
      --hud-accent-soft: #f4e6c8;
      --hud-accent-text: #e0a13c;
      --hud-accent-glow: rgba(224, 161, 60, 0.2);
      --hud-accent-glow-strong: rgba(224, 161, 60, 0.45);
      --hud-plate-background: rgb(20 27 23 / 88%);
      --hud-plate-border: #3a4a3f;
      --hud-plate-title: #f4efe4;
      --hud-plate-text: #c9d2cc;
      --hud-plate-muted: #9aa89f;
    }
    /*
     * The Plaza: terracotta on warm dark umber, white on the accent (4.67 : 1). The plate pairings
     * are ≥ 4.5 : 1 even with the plate over pure white; the chips keep the shared dark glass.
     */
    :host([data-environment='plaza']) {
      --hud-accent: #b8583a;
      --hud-accent-ink: #fff;
      --hud-accent-soft: #f6dcc8;
      --hud-accent-text: #f0a585;
      --hud-accent-glow: rgba(184, 88, 58, 0.25);
      --hud-accent-glow-strong: rgba(184, 88, 58, 0.55);
      --hud-plate-background: rgb(46 34 28 / 88%);
      --hud-plate-border: #8a6a4a;
      --hud-plate-title: #f7efe6;
      --hud-plate-text: #e6d8cc;
      --hud-plate-muted: #bca99a;
    }
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
    .status {
      position: absolute;
      inset-block-start: 2.5rem;
      inset-inline-start: 1rem;
      margin: 0;
      font-size: 0.8rem;
      opacity: 0.85;
    }
    .prompt {
      position: absolute;
      inset-block-end: 18%;
      inset-inline: 0;
      margin: 0;
      text-align: center;
      font-size: 1.05rem;
    }
    .prompt.with-stations {
      inset-block-end: 62px;
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
    .toast,
    .moment-banner {
      position: absolute;
      inset-inline: 0;
      inset-block-start: 70px;
      inline-size: fit-content;
      max-inline-size: calc(100vw - 32px);
      margin: 0 auto;
      text-align: center;
    }
    .toast {
      padding: 7px 14px;
      border: 1px solid var(--hud-accent);
      border-radius: 999px;
      background: rgb(0 0 0 / 72%);
      color: var(--hud-accent-soft);
      font:
        500 13px 'IBM Plex Mono',
        monospace;
      animation: toast-fade 2.2s linear forwards;
    }
    .toast.banner-active {
      inset-block-start: 112px;
    }
    .moment-banner {
      padding: 7px 14px;
      border-radius: 999px;
      background: var(--hud-accent);
      color: var(--hud-accent-ink);
      font:
        600 14px system-ui,
        sans-serif;
    }
    .moment-banner.banner-enter {
      animation: hud-banner-enter 0.3s linear both;
    }
    .moment-banner.banner-leave {
      animation: hud-banner-leave 0.3s linear both;
    }
    .pitch {
      position: absolute;
      inset-block-start: 36%;
      inset-inline: 16px;
      text-align: center;
      animation: pitch-fade 2.7s linear both;
    }
    .pitch h1 {
      margin: 0;
      color: #fff;
      font:
        800 clamp(40px, 9vw, 64px) / 1 Barlow,
        sans-serif;
      text-shadow: 0 2px 18px rgb(0 0 0 / 60%);
    }
    .pitch p {
      margin: 10px 0 0;
      color: #f4efe4;
      font:
        500 18px system-ui,
        sans-serif;
    }
    @keyframes toast-fade {
      0%,
      81.8% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    @keyframes pitch-fade {
      0%,
      5.6%,
      100% {
        opacity: 0;
      }
      20.4%,
      85.2% {
        opacity: 1;
      }
    }
    :host(.reduced-motion) .moment-banner {
      animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .moment-banner {
        animation: none;
      }
    }
    @keyframes hud-banner-enter {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes hud-banner-leave {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `,
  // Whether the world is audible, for the end-to-end suite: SwiftShader has no audio output, so
  // the state of the context is the only thing a browser test can check.
  host: {
    '[attr.data-audio]': 'audio.state()',
    '[attr.data-environment]': 'store.environment()',
    '[class.reduced-motion]': 'capability.reducedMotion()',
  },
})
export class Hud {
  protected readonly store = inject(WorldStore);
  protected readonly audio = inject(AudioService);
  protected readonly capability = inject(CapabilityService);

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

  private readonly arrivalBarReady = signal(false);
  protected readonly displayedBanner = signal<string | null>(null);
  protected readonly bannerVisible = signal(false);

  private hasDisplayedBanner = false;

  protected readonly stationBarHidden = computed(
    () => this.store.shot() === 'arrival' && !this.arrivalBarReady(),
  );

  constructor() {
    effect((onCleanup) => {
      if (this.store.shot() !== 'arrival') {
        this.arrivalBarReady.set(true);
        return;
      }

      this.arrivalBarReady.set(false);
      const timer = setTimeout(() => this.arrivalBarReady.set(true), ARRIVAL_BAR_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });

    effect((onCleanup) => {
      const nextBanner = this.store.banner();
      if (nextBanner !== null) {
        this.displayedBanner.set(nextBanner);
        this.bannerVisible.set(true);
        this.hasDisplayedBanner = true;
        return;
      }

      if (!this.hasDisplayedBanner) {
        return;
      }

      this.bannerVisible.set(false);
      const timer = setTimeout(() => this.displayedBanner.set(null), BANNER_FADE_MS);
      onCleanup(() => clearTimeout(timer));
    });

    if (!this.showStats()) {
      return;
    }

    // Read once up front so the overlay is not blank for the first half second.
    this.stats.set(this.engine.stats());

    const timer = setInterval(() => this.stats.set(this.engine.stats()), STATS_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}

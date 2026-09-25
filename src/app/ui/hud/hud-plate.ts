import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { CapabilityService } from '@engine/capability.service';
import type { StationPlate } from '@engine/stations/station';

const PLATE_FADE_MS = 250;

@Component({
  selector: 'app-hud-plate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (displayedPlate(); as plate) {
      <section
        class="plate"
        data-role="plate"
        [class.plate-enter]="plateVisible()"
        [class.plate-leave]="!plateVisible()"
      >
        <span class="kicker">{{ plate.kicker }}</span>
        <h2>{{ plate.title }}</h2>
        <p class="text">{{ plate.text }}</p>
        <p class="en">{{ plate.en }}</p>
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset-inline-start: 16px;
      inset-block-end: 62px;
      display: block;
      max-inline-size: min(520px, calc(100vw - 32px));
      pointer-events: none;
    }
    .plate {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 18px;
      border: 1px solid var(--hud-plate-border, #3a4a3f);
      border-radius: 10px;
      background: var(--hud-plate-background, rgb(20 27 23 / 88%));
      color: var(--hud-plate-text, #c9d2cc);
      text-shadow: none;
    }
    .plate.plate-enter {
      animation: hud-plate-enter 0.25s linear both;
    }
    .plate.plate-leave {
      animation: hud-plate-leave 0.25s linear both;
    }
    .kicker {
      color: var(--hud-accent-text, #e0a13c);
      font:
        600 12px 'IBM Plex Mono',
        monospace;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      color: var(--hud-plate-title, #f4efe4);
      font:
        700 32px 'Barlow Semi Condensed',
        sans-serif;
    }
    p {
      margin: 0;
    }
    .text {
      color: var(--hud-plate-text, #c9d2cc);
      font:
        500 18px/1.45 'IBM Plex Sans',
        sans-serif;
    }
    .en {
      color: var(--hud-plate-muted, #9aa89f);
      font:
        400 14px 'IBM Plex Sans',
        sans-serif;
    }
    :host(.reduced-motion) .plate {
      animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .plate {
        animation: none;
      }
    }
    @keyframes hud-plate-enter {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes hud-plate-leave {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `,
  host: {
    '[class.reduced-motion]': 'capability.reducedMotion()',
  },
})
export class HudPlate {
  readonly plate = input<StationPlate | null>(null);

  protected readonly capability = inject(CapabilityService);
  protected readonly displayedPlate = signal<StationPlate | null>(null);
  protected readonly plateVisible = signal(false);

  private hasDisplayedPlate = false;

  constructor() {
    effect((onCleanup) => {
      const nextPlate = this.plate();
      if (nextPlate) {
        this.displayedPlate.set(nextPlate);
        this.plateVisible.set(true);
        this.hasDisplayedPlate = true;
        return;
      }

      if (!this.hasDisplayedPlate) {
        return;
      }

      this.plateVisible.set(false);
      const timer = setTimeout(() => this.displayedPlate.set(null), PLATE_FADE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}

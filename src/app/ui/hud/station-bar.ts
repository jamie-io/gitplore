import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CapabilityService } from '@engine/capability.service';
import type { StationChip } from '@engine/stations/station';

@Component({
  selector: 'app-station-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (chip of chips(); track chip.id) {
      <button
        class="chip"
        type="button"
        data-role="station-chip"
        [attr.data-state]="chip.state"
        [attr.aria-label]="'Station ' + chip.index + ': ' + chip.name"
        (click)="glide.emit(chip.index)"
      >
        <span class="mark" aria-hidden="true">{{ mark(chip) }}</span>
        <span>{{ chip.name }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset-inline: 0;
      inset-block-end: 14px;
      display: flex;
      justify-content: center;
      gap: 6px;
      row-gap: 6px;
      flex-wrap: wrap;
      max-inline-size: calc(100vw - 32px);
      margin-inline: auto;
      pointer-events: none;
      transition: opacity 0.4s;
    }
    :host(.hidden) {
      opacity: 0;
      pointer-events: none;
    }
    :host(.hidden) .chip {
      pointer-events: none;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px 5px 6px;
      border: 1px solid transparent;
      border-radius: 999px;
      color: #fff;
      font:
        500 12px system-ui,
        sans-serif;
      cursor: pointer;
      pointer-events: auto;
      white-space: nowrap;
    }
    .chip[data-state='here'] {
      border-color: #e0a13c;
      background: #e0a13c;
      color: #1a1408;
    }
    .chip[data-state='visited'] {
      border-color: #e0a13c;
      background: rgb(0 0 0 / 55%);
      color: #f4e6c8;
    }
    .chip[data-state='next'] {
      border-color: #fff;
      background: rgb(0 0 0 / 55%);
      color: #fff;
      animation: station-next-pulse 1.57s ease-in-out infinite;
    }
    .chip[data-state='open'] {
      border-color: rgb(255 255 255 / 35%);
      background: rgb(0 0 0 / 45%);
      color: #fff;
    }
    .mark {
      display: inline-grid;
      place-items: center;
      inline-size: 18px;
      block-size: 18px;
      flex: 0 0 18px;
      border-radius: 50%;
      font:
        600 11px 'IBM Plex Mono',
        monospace;
    }
    .chip[data-state='here'] .mark {
      background: #1a1408;
      color: #e0a13c;
    }
    .chip[data-state='visited'] .mark {
      background: #e0a13c;
      color: #1a1408;
    }
    .chip[data-state='next'] .mark {
      background: #fff;
      color: #1a1408;
    }
    .chip[data-state='open'] .mark {
      background: rgb(255 255 255 / 18%);
      color: #fff;
    }
    .chip:focus-visible {
      outline: 2px solid #e0a13c;
      outline-offset: 2px;
    }
    :host(.reduced-motion) .chip[data-state='next'] {
      animation: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .chip[data-state='next'] {
        animation: none;
      }
    }
    @keyframes station-next-pulse {
      0%,
      100% {
        box-shadow: 0 0 0 2px rgba(224, 161, 60, 0.2);
      }
      50% {
        box-shadow: 0 0 0 4px rgba(224, 161, 60, 0.45);
      }
    }
  `,
  host: {
    '[class.hidden]': 'hidden()',
    '[class.reduced-motion]': 'capability.reducedMotion()',
    '[attr.aria-hidden]': "hidden() ? 'true' : null",
    '[attr.inert]': "hidden() ? '' : null",
  },
})
export class StationBar {
  readonly chips = input<readonly StationChip[]>([]);
  readonly hidden = input(false);
  readonly glide = output<number>();

  protected readonly capability = inject(CapabilityService);

  protected mark(chip: StationChip): string {
    return chip.state === 'visited' ? '✓' : String(chip.index);
  }
}

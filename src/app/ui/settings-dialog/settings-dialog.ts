import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { CapabilityService, QualityTier } from '@engine/capability.service';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  SettingsStore,
  ViewMode,
} from '../store/settings.store';
import { WorldStore } from '../store/world.store';

const TIER_LABELS: Record<QualityTier, string> = { low: 'niedrig', medium: 'mittel', high: 'hoch' };

type MotionChoice = 'auto' | 'reduced' | 'full';

interface SettingsModel {
  quality: 'auto' | QualityTier;
  sensitivity: number;
  motion: MotionChoice;
  viewMode: ViewMode;
  volume: number;
  muted: boolean;
}

function motionChoice(override: boolean | null): MotionChoice {
  return override === null ? 'auto' : override ? 'reduced' : 'full';
}

/**
 * Quality tier, mouse sensitivity and a reduced-motion override (IMPLEMENTATION_PLAN.md §6),
 * persisted by `SettingsStore`. A Signal Form: edits flow into the model signal, an effect
 * writes them through to the store.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [FormField, FocusTrapDirective],
  template: `
    <div class="backdrop">
      <div
        appFocusTrap
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        (keydown.escape)="close()"
      >
        <h2 id="settings-title">Einstellungen</h2>

        <div class="row">
          <label for="settings-quality">Grafikqualität</label>
          <select id="settings-quality" [formField]="settings.quality">
            <option value="auto">Automatisch ({{ tierLabel() }})</option>
            <option value="low">Niedrig</option>
            <option value="medium">Mittel</option>
            <option value="high">Hoch</option>
          </select>
        </div>

        <div class="row">
          <label for="settings-sensitivity">Mausempfindlichkeit ({{ model().sensitivity }})</label>
          <input
            id="settings-sensitivity"
            type="range"
            step="0.1"
            [formField]="settings.sensitivity"
          />
        </div>

        <div class="row">
          <label for="settings-motion">Bewegung</label>
          <select id="settings-motion" [formField]="settings.motion">
            <option value="auto">Wie im System eingestellt</option>
            <option value="reduced">Reduziert (kein Kameraflug, ruhiger Himmel)</option>
            <option value="full">Voll</option>
          </select>
        </div>

        <div class="row">
          <label for="settings-view-mode">Ansicht</label>
          <select id="settings-view-mode" [formField]="settings.viewMode">
            <option value="third">Dritte Person</option>
            <option value="first">Erste Person</option>
          </select>
        </div>

        <div class="row">
          <label for="settings-volume">Lautstärke ({{ volumePercent() }} %)</label>
          <input
            id="settings-volume"
            type="range"
            step="0.05"
            [formField]="settings.volume"
          />
        </div>

        <div class="row">
          <input id="settings-muted" type="checkbox" [formField]="settings.muted" />
          <label for="settings-muted">Stumm</label>
        </div>

        <p class="note">Grafikqualität wirkt teils erst nach dem Neuladen der Seite.</p>

        <footer>
          <button type="button" data-role="close" (click)="close()">
            Schließen <kbd>Esc</kbd>
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: clamp(0.5rem, 3vw, 2rem);
      background: rgb(10 20 30 / 55%);
      backdrop-filter: blur(3px);
    }
    .dialog {
      display: grid;
      gap: 1rem;
      inline-size: min(28rem, 100%);
      padding: clamp(1rem, 3vw, 2rem);
      border-radius: 0.9rem;
      background: #fff;
      color: #16202a;
      box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 35%);
      font-family: system-ui, sans-serif;
    }
    h2 {
      margin: 0;
    }
    .row {
      display: grid;
      gap: 0.35rem;
    }
    .note {
      margin: 0;
      font-size: 0.85rem;
      color: #3c4854;
    }
    select,
    input[type='range'] {
      inline-size: 100%;
      font: inherit;
    }
    footer {
      display: flex;
      justify-content: flex-end;
    }
    button {
      padding: 0.4rem 0.9rem;
      border: 1px solid currentcolor;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    kbd {
      font: inherit;
      font-size: 0.8em;
      opacity: 0.7;
    }
  `,
})
export class SettingsDialog {
  private readonly store = inject(SettingsStore);
  private readonly world = inject(WorldStore);
  private readonly capability = inject(CapabilityService);

  protected readonly tierLabel = computed(() => TIER_LABELS[this.capability.detectedTier()]);

  protected readonly model = signal<SettingsModel>({
    quality: this.store.qualityOverride() ?? 'auto',
    sensitivity: this.store.sensitivity(),
    motion: motionChoice(this.store.reducedMotionOverride()),
    viewMode: this.store.viewMode(),
    volume: this.store.volume(),
    muted: this.store.muted(),
  });

  protected readonly volumePercent = computed(() => Math.round(this.model().volume * 100));

  protected readonly settings = form(this.model, (path) => {
    // The range input gets its min/max from here; the store clamps to the same bounds.
    min(path.sensitivity, MIN_SENSITIVITY);
    max(path.sensitivity, MAX_SENSITIVITY);
    min(path.volume, 0);
    max(path.volume, 1);
  });

  constructor() {
    // Write through only what the visitor changed: merely opening the dialog must not turn
    // "follow the system" into a stored choice.
    let previous = this.model();
    effect(() => {
      const current = this.model();
      if (current.quality !== previous.quality) {
        this.store.setQualityOverride(current.quality === 'auto' ? null : current.quality);
      }
      if (current.sensitivity !== previous.sensitivity) {
        this.store.setSensitivity(Number(current.sensitivity));
      }
      if (current.motion !== previous.motion) {
        this.store.setReducedMotionOverride(
          current.motion === 'auto' ? null : current.motion === 'reduced',
        );
      }
      if (current.viewMode !== previous.viewMode) {
        this.store.setViewMode(current.viewMode);
      }
      if (current.volume !== previous.volume) {
        this.store.setVolume(Number(current.volume));
      }
      if (current.muted !== previous.muted) {
        this.store.setMuted(current.muted);
      }
      previous = current;
    });
  }

  protected close(): void {
    this.world.setSettingsOpen(false);
  }
}

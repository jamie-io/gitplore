import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { CapabilityService, QualityTier } from '@engine/capability.service';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import { MAX_SENSITIVITY, MIN_SENSITIVITY, SettingsStore } from '../store/settings.store';
import { WorldStore } from '../store/world.store';

const TIER_LABELS: Record<QualityTier, string> = { low: 'niedrig', medium: 'mittel', high: 'hoch' };

interface SettingsModel {
  quality: 'auto' | QualityTier;
  sensitivity: number;
  reducedMotion: boolean;
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
          <input
            id="settings-reduced-motion"
            type="checkbox"
            [formField]="settings.reducedMotion"
          />
          <label for="settings-reduced-motion"
            >Bewegung reduzieren (kein Kameraflug, ruhiger Himmel)</label
          >
        </div>

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
    .row:has([type='checkbox']) {
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 0.6rem;
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
    reducedMotion: this.store.reducedMotionOverride() ?? this.capability.reducedMotion(),
  });

  protected readonly settings = form(this.model, (path) => {
    // The range input gets its min/max from here; the store clamps to the same bounds.
    min(path.sensitivity, MIN_SENSITIVITY);
    max(path.sensitivity, MAX_SENSITIVITY);
  });

  constructor() {
    effect(() => {
      const { quality, sensitivity, reducedMotion } = this.model();
      this.store.setQualityOverride(quality === 'auto' ? null : quality);
      this.store.setSensitivity(Number(sensitivity));
      this.store.setReducedMotionOverride(reducedMotion);
    });
  }

  protected close(): void {
    this.world.setSettingsOpen(false);
  }
}

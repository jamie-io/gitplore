import { Service, signal } from '@angular/core';
import { QualityTier } from '@engine/capability.service';

const STORAGE_KEY = 'gitplore.settings';

export const MIN_SENSITIVITY = 0.2;
export const MAX_SENSITIVITY = 3;

interface StoredSettings {
  qualityOverride: QualityTier | null;
  sensitivity: number;
  sound: boolean;
}

const DEFAULTS: StoredSettings = { qualityOverride: null, sensitivity: 1, sound: true };

/** User preferences, persisted in localStorage (IMPLEMENTATION_PLAN.md §6). */
@Service()
export class SettingsStore {
  private readonly stored = read();

  readonly qualityOverride = signal(this.stored.qualityOverride);
  readonly sensitivity = signal(this.stored.sensitivity);
  readonly sound = signal(this.stored.sound);

  setQualityOverride(tier: QualityTier | null): void {
    this.qualityOverride.set(tier);
    this.persist();
  }

  setSensitivity(value: number): void {
    this.sensitivity.set(Math.min(Math.max(value, MIN_SENSITIVITY), MAX_SENSITIVITY));
    this.persist();
  }

  setSound(on: boolean): void {
    this.sound.set(on);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          qualityOverride: this.qualityOverride(),
          sensitivity: this.sensitivity(),
          sound: this.sound(),
        } satisfies StoredSettings),
      );
    } catch {
      // Blocked storage only costs the visitor persistence, not the session.
    }
  }
}

function read(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StoredSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

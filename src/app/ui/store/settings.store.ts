import { Service, inject, signal } from '@angular/core';
import { CapabilityService, QualityTier } from '@engine/capability.service';
import { InputService } from '@engine/input.service';

const STORAGE_KEY = 'gitplore.settings';

export const MIN_SENSITIVITY = 0.2;
export const MAX_SENSITIVITY = 3;

interface StoredSettings {
  qualityOverride: QualityTier | null;
  sensitivity: number;
  /** `null` follows the system's `prefers-reduced-motion`. */
  reducedMotionOverride: boolean | null;
}

const DEFAULTS: StoredSettings = {
  qualityOverride: null,
  sensitivity: 1,
  reducedMotionOverride: null,
};

/**
 * User preferences, persisted in localStorage and applied straight to the engine services they
 * concern (IMPLEMENTATION_PLAN.md §6).
 */
@Service()
export class SettingsStore {
  private readonly capability = inject(CapabilityService);
  private readonly input = inject(InputService);
  private readonly stored = read();

  readonly qualityOverride = signal(this.stored.qualityOverride);
  readonly sensitivity = signal(this.stored.sensitivity);
  readonly reducedMotionOverride = signal(this.stored.reducedMotionOverride);

  constructor() {
    this.apply();
  }

  setQualityOverride(tier: QualityTier | null): void {
    this.qualityOverride.set(tier);
    this.apply();
    this.persist();
  }

  setSensitivity(value: number): void {
    this.sensitivity.set(clampSensitivity(value));
    this.apply();
    this.persist();
  }

  setReducedMotionOverride(reduced: boolean | null): void {
    this.reducedMotionOverride.set(reduced);
    this.apply();
    this.persist();
  }

  private apply(): void {
    this.capability.override(this.qualityOverride());
    this.capability.overrideReducedMotion(this.reducedMotionOverride());
    this.input.sensitivity = this.sensitivity();
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          qualityOverride: this.qualityOverride(),
          sensitivity: this.sensitivity(),
          reducedMotionOverride: this.reducedMotionOverride(),
        } satisfies StoredSettings),
      );
    } catch {
      // Blocked storage only costs the visitor persistence, not the session.
    }
  }
}

/** Takes `unknown` because it also guards the untrusted stored value, not just the setter's input. */
function clampSensitivity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, MIN_SENSITIVITY), MAX_SENSITIVITY)
    : DEFAULTS.sensitivity;
}

const TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

/** Stored data is untrusted: it reaches the engine, so every field is validated on the way in. */
function read(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof StoredSettings, unknown>>;
    return {
      qualityOverride:
        TIERS.find((tier) => tier === parsed.qualityOverride) ?? DEFAULTS.qualityOverride,
      sensitivity: clampSensitivity(parsed.sensitivity),
      reducedMotionOverride:
        typeof parsed.reducedMotionOverride === 'boolean'
          ? parsed.reducedMotionOverride
          : DEFAULTS.reducedMotionOverride,
    };
  } catch {
    return DEFAULTS;
  }
}

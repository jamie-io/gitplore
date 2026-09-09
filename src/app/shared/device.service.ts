import { InjectionToken, Service, computed, inject, signal } from '@angular/core';

/** Width below which the 3D hub is not offered (IMPLEMENTATION_PLAN.md §7). */
export const SIMPLE_VIEW_MAX_WIDTH = 900;

const FORCE_3D_KEY = 'gitplore.force3d';

/**
 * The raw browser capabilities `DeviceService` decides on. Behind a token so tests can describe a
 * device instead of faking `window`.
 */
export interface DeviceProbe {
  coarsePointer(): boolean;
  hasWebgl2(): boolean;
  viewportWidth(): number;
}

export function browserDeviceProbe(): DeviceProbe {
  let webgl2: boolean | undefined;

  return {
    coarsePointer: () => window.matchMedia('(pointer: coarse)').matches,
    hasWebgl2: () => (webgl2 ??= detectWebgl2()),
    viewportWidth: () => window.innerWidth,
  };
}

function detectWebgl2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export const DEVICE_PROBE = new InjectionToken<DeviceProbe>('DEVICE_PROBE', {
  providedIn: 'root',
  factory: browserDeviceProbe,
});

@Service()
export class DeviceService {
  private readonly probe = inject(DEVICE_PROBE);

  /** Set by `?force3d=1`; persisted so the choice survives a reload. */
  private readonly force3d = signal(readForce3d());

  readonly simpleView = computed(
    () =>
      !this.force3d() &&
      (this.probe.coarsePointer() ||
        !this.probe.hasWebgl2() ||
        this.probe.viewportWidth() < SIMPLE_VIEW_MAX_WIDTH),
  );

  rememberForce3d(): void {
    this.force3d.set(true);
    try {
      localStorage.setItem(FORCE_3D_KEY, '1');
    } catch {
      // Private mode or blocked storage: the override still holds for this session.
    }
  }
}

function readForce3d(): boolean {
  try {
    return localStorage.getItem(FORCE_3D_KEY) === '1';
  } catch {
    return false;
  }
}

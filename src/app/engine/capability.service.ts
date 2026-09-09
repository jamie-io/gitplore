import { InjectionToken, Service, computed, inject, signal } from '@angular/core';

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  readonly pixelRatioCap: number;
  readonly shadows: boolean;
  readonly antialias: boolean;
  readonly fogFar: number;
  readonly propDensity: number;
}

const SETTINGS: Record<QualityTier, QualitySettings> = {
  low: { pixelRatioCap: 1, shadows: false, antialias: false, fogFar: 120, propDensity: 0.25 },
  medium: { pixelRatioCap: 1.5, shadows: true, antialias: true, fogFar: 220, propDensity: 0.6 },
  high: { pixelRatioCap: 2, shadows: true, antialias: true, fogFar: 320, propDensity: 1 },
};

export function qualitySettings(tier: QualityTier): QualitySettings {
  return SETTINGS[tier];
}

/** What the browser tells us about the machine, probed once at startup. */
export interface DeviceCapabilities {
  readonly webgl2: boolean;
  readonly rendererDescription: string;
  readonly hardwareConcurrency: number;
  readonly devicePixelRatio: number;
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
}

export function probeDeviceCapabilities(): DeviceCapabilities {
  const canvas = document.createElement('canvas');
  const gl = safeContext(canvas);
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');

  return {
    webgl2: gl !== null,
    rendererDescription: debugInfo
      ? String(gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
      : '',
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    devicePixelRatio: window.devicePixelRatio || 1,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}

function safeContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2');
  } catch {
    return null;
  }
}

export const DEVICE_CAPABILITIES = new InjectionToken<DeviceCapabilities>('DEVICE_CAPABILITIES', {
  providedIn: 'root',
  factory: probeDeviceCapabilities,
});

/** Frame time above which the renderer is clearly not keeping up (IMPLEMENTATION_PLAN.md §2). */
const SLOW_FRAME_MS = 24;
const SAMPLE_WINDOW_MS = 3000;

const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|software|basic render/i;
const WEAK_INTEGRATED = /intel|uhd graphics|hd graphics/i;

export function detectTier(capabilities: DeviceCapabilities): QualityTier {
  if (
    !capabilities.webgl2 ||
    SOFTWARE_RENDERERS.test(capabilities.rendererDescription) ||
    capabilities.hardwareConcurrency <= 2
  ) {
    return 'low';
  }

  const weak = WEAK_INTEGRATED.test(capabilities.rendererDescription);
  return !weak && capabilities.hardwareConcurrency >= 8 ? 'high' : 'medium';
}

function stepDown(tier: QualityTier): QualityTier {
  return tier === 'high' ? 'medium' : 'low';
}

@Service()
export class CapabilityService {
  private readonly capabilities = inject(DEVICE_CAPABILITIES);
  private readonly detected = detectTier(this.capabilities);

  /** Set once when the rolling frame average says the detected tier was too optimistic. */
  private readonly steppedDown = signal(false);
  private readonly userTier = signal<QualityTier | null>(null);

  private sampledMs = 0;
  private sampledFrames = 0;

  readonly reducedMotion = this.capabilities.reducedMotion;

  readonly tier = computed<QualityTier>(
    () => this.userTier() ?? (this.steppedDown() ? stepDown(this.detected) : this.detected),
  );

  readonly settings = computed(() => qualitySettings(this.tier()));

  /** Called from the render loop. Steps down at most once, so quality cannot oscillate. */
  sampleFrame(frameMs: number): void {
    if (this.steppedDown()) {
      return;
    }

    this.sampledMs += frameMs;
    this.sampledFrames++;

    if (this.sampledMs < SAMPLE_WINDOW_MS) {
      return;
    }

    if (this.sampledMs / this.sampledFrames > SLOW_FRAME_MS) {
      this.steppedDown.set(true);
    }

    this.sampledMs = 0;
    this.sampledFrames = 0;
  }

  /** Explicit choice from the settings dialog; `null` hands control back to detection. */
  override(tier: QualityTier | null): void {
    this.userTier.set(tier);
  }
}

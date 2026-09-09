import { TestBed } from '@angular/core/testing';
import {
  CapabilityService,
  DEVICE_CAPABILITIES,
  DeviceCapabilities,
  qualitySettings,
} from './capability.service';

const CAPABLE: DeviceCapabilities = {
  webgl2: true,
  rendererDescription: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
  hardwareConcurrency: 10,
  devicePixelRatio: 2,
  reducedMotion: false,
  coarsePointer: false,
};

function serviceWith(overrides: Partial<DeviceCapabilities>): CapabilityService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DEVICE_CAPABILITIES, useValue: { ...CAPABLE, ...overrides } }],
  });
  return TestBed.inject(CapabilityService);
}

describe('CapabilityService tier detection', () => {
  it('gives a modern GPU with many cores the high tier', () => {
    expect(serviceWith({}).tier()).toBe('high');
  });

  it('drops software rendering to the low tier', () => {
    expect(serviceWith({ rendererDescription: 'Google SwiftShader' }).tier()).toBe('low');
  });

  it('drops a machine with few cores to the low tier', () => {
    expect(serviceWith({ hardwareConcurrency: 2 }).tier()).toBe('low');
  });

  it('puts an older integrated GPU on the medium tier', () => {
    expect(
      serviceWith({
        rendererDescription: 'Intel(R) UHD Graphics 620',
        hardwareConcurrency: 4,
      }).tier(),
    ).toBe('medium');
  });
});

describe('CapabilityService adaptive stepping', () => {
  it('steps down one tier when frames stay slower than 24 ms', () => {
    const capability = serviceWith({});

    for (let i = 0; i < 200; i++) capability.sampleFrame(30);

    expect(capability.tier()).toBe('medium');
  });

  it('never steps down twice, however bad it gets', () => {
    const capability = serviceWith({});

    for (let i = 0; i < 2000; i++) capability.sampleFrame(80);

    expect(capability.tier()).toBe('medium');
  });

  it('keeps the tier while frames are comfortable', () => {
    const capability = serviceWith({});

    for (let i = 0; i < 400; i++) capability.sampleFrame(12);

    expect(capability.tier()).toBe('high');
  });

  it('honours an explicit user override instead of the detected tier', () => {
    const capability = serviceWith({ rendererDescription: 'Google SwiftShader' });

    capability.override('high');

    expect(capability.tier()).toBe('high');
  });
});

describe('qualitySettings', () => {
  it('caps the pixel ratio lower on weaker tiers', () => {
    expect(qualitySettings('low').pixelRatioCap).toBeLessThan(
      qualitySettings('high').pixelRatioCap,
    );
  });

  it('turns shadows and antialiasing off on the low tier', () => {
    expect(qualitySettings('low')).toMatchObject({ shadows: false, antialias: false });
  });

  it('draws less far and less densely on the low tier', () => {
    expect(qualitySettings('low').fogFar).toBeLessThan(qualitySettings('high').fogFar);
    expect(qualitySettings('low').propDensity).toBeLessThan(qualitySettings('high').propDensity);
  });
});

describe('CapabilityService reduced motion', () => {
  it('follows the system preference by default', () => {
    expect(serviceWith({ reducedMotion: true }).reducedMotion()).toBe(true);
    expect(serviceWith({ reducedMotion: false }).reducedMotion()).toBe(false);
  });

  it('lets the visitor override the system preference either way', () => {
    const service = serviceWith({ reducedMotion: false });

    service.overrideReducedMotion(true);
    expect(service.reducedMotion()).toBe(true);

    service.overrideReducedMotion(null);
    expect(service.reducedMotion()).toBe(false);
  });
});

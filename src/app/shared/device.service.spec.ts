import { TestBed } from '@angular/core/testing';
import { DEVICE_PROBE, DeviceProbe, DeviceService } from './device.service';

const DESKTOP: DeviceProbe = {
  coarsePointer: () => false,
  hasWebgl2: () => true,
  viewportWidth: () => 1440,
};

function serviceWith(overrides: Partial<DeviceProbe>): DeviceService {
  TestBed.configureTestingModule({
    providers: [{ provide: DEVICE_PROBE, useValue: { ...DESKTOP, ...overrides } }],
  });
  return TestBed.inject(DeviceService);
}

describe('DeviceService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('uses the 3D world on a wide desktop with a fine pointer and WebGL2', () => {
    expect(serviceWith({}).simpleView()).toBe(false);
  });

  it('falls back to the simple view on a coarse pointer', () => {
    expect(serviceWith({ coarsePointer: () => true }).simpleView()).toBe(true);
  });

  it('falls back to the simple view without WebGL2', () => {
    expect(serviceWith({ hasWebgl2: () => false }).simpleView()).toBe(true);
  });

  it('falls back to the simple view below 900px', () => {
    expect(serviceWith({ viewportWidth: () => 899 }).simpleView()).toBe(true);
  });

  it('keeps the 3D world when force3d is remembered, despite a coarse pointer', () => {
    const device = serviceWith({ coarsePointer: () => true });

    device.rememberForce3d();

    expect(device.simpleView()).toBe(false);
  });

  it('restores a remembered force3d choice in a later session', () => {
    serviceWith({ coarsePointer: () => true }).rememberForce3d();
    TestBed.resetTestingModule();

    expect(serviceWith({ coarsePointer: () => true }).simpleView()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { CapabilityService, DEVICE_CAPABILITIES } from '@engine/capability.service';
import { InputService } from '@engine/input.service';
import { MAX_SENSITIVITY, MIN_SENSITIVITY, SettingsStore } from './settings.store';

function freshStore(): SettingsStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DEVICE_CAPABILITIES,
        useValue: {
          webgl2: true,
          rendererDescription: 'Apple M2',
          hardwareConcurrency: 10,
          devicePixelRatio: 2,
          reducedMotion: false,
          coarsePointer: false,
        },
      },
    ],
  });
  return TestBed.inject(SettingsStore);
}

describe('SettingsStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts with detection in charge for quality and motion', () => {
    const settings = freshStore();

    expect(settings.qualityOverride()).toBeNull();
    expect(settings.reducedMotionOverride()).toBeNull();
  });

  it('remembers a chosen quality tier across sessions', () => {
    freshStore().setQualityOverride('low');

    expect(freshStore().qualityOverride()).toBe('low');
  });

  it('hands quality back to detection when cleared', () => {
    const settings = freshStore();
    settings.setQualityOverride('low');
    settings.setQualityOverride(null);

    expect(freshStore().qualityOverride()).toBeNull();
  });

  it('keeps mouse sensitivity inside a usable range', () => {
    const settings = freshStore();

    settings.setSensitivity(1000);
    expect(settings.sensitivity()).toBe(MAX_SENSITIVITY);

    settings.setSensitivity(-5);
    expect(settings.sensitivity()).toBe(MIN_SENSITIVITY);
  });

  it('remembers sensitivity and the motion choice across sessions', () => {
    const settings = freshStore();
    settings.setSensitivity(1.4);
    settings.setReducedMotionOverride(true);

    const reopened = freshStore();
    expect(reopened.sensitivity()).toBeCloseTo(1.4, 6);
    expect(reopened.reducedMotionOverride()).toBe(true);
  });

  it('falls back to defaults when stored data is corrupt', () => {
    localStorage.setItem('gitplore.settings', '{not json');

    expect(freshStore().sensitivity()).toBe(1);
  });

  it('applies stored choices to the engine as soon as it exists', () => {
    freshStore().setQualityOverride('low');
    freshStore().setSensitivity(2);

    const reopened = freshStore();
    expect(TestBed.inject(CapabilityService).tier()).toBe('low');
    expect(TestBed.inject(InputService).sensitivity).toBe(2);
    expect(reopened.qualityOverride()).toBe('low');
  });

  it('pushes a reduced-motion choice through to the capability service', () => {
    freshStore().setReducedMotionOverride(true);

    expect(TestBed.inject(CapabilityService).reducedMotion()).toBe(true);
  });
});

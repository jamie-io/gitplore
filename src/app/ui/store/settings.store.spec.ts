import { TestBed } from '@angular/core/testing';
import { MAX_SENSITIVITY, MIN_SENSITIVITY, SettingsStore } from './settings.store';

function freshStore(): SettingsStore {
  TestBed.resetTestingModule();
  return TestBed.inject(SettingsStore);
}

describe('SettingsStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts with detection in charge and sound on', () => {
    const settings = freshStore();

    expect(settings.qualityOverride()).toBeNull();
    expect(settings.sound()).toBe(true);
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

  it('remembers sensitivity and sound across sessions', () => {
    const settings = freshStore();
    settings.setSensitivity(1.4);
    settings.setSound(false);

    const reopened = freshStore();
    expect(reopened.sensitivity()).toBeCloseTo(1.4, 6);
    expect(reopened.sound()).toBe(false);
  });

  it('falls back to defaults when stored data is corrupt', () => {
    localStorage.setItem('gitplore.settings', '{not json');

    expect(freshStore().sound()).toBe(true);
  });
});

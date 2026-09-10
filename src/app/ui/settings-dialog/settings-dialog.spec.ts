import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CapabilityService, DEVICE_CAPABILITIES } from '@engine/capability.service';
import { SettingsStore } from '../store/settings.store';
import { WorldStore } from '../store/world.store';
import { SettingsDialog } from './settings-dialog';
import { CAPABLE } from '@engine/testing/world-context';

describe('SettingsDialog', () => {
  let fixture: ComponentFixture<SettingsDialog>;
  let settings: SettingsStore;
  let world: WorldStore;

  const host = () => fixture.nativeElement as HTMLElement;
  const field = <T extends HTMLElement>(name: string) =>
    host().querySelector<T>(`#settings-${name}`)!;
  const type = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SettingsDialog],
      providers: [{ provide: DEVICE_CAPABILITIES, useValue: CAPABLE }],
    }).compileComponents();
    settings = TestBed.inject(SettingsStore);
    world = TestBed.inject(WorldStore);
    world.setSettingsOpen(true);
    fixture = TestBed.createComponent(SettingsDialog);
    await fixture.whenStable();
  });

  it('is a labelled modal dialog', () => {
    const dialog = host().querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('labels every control for assistive technology', () => {
    for (const control of Array.from(host().querySelectorAll('input, select'))) {
      const id = control.getAttribute('id');
      expect(id, 'control without id').toBeTruthy();
      expect(host().querySelector(`label[for="${id}"]`), `no label for ${id}`).not.toBeNull();
    }
  });

  it('offers automatic quality plus the three tiers', () => {
    const options = Array.from(field<HTMLSelectElement>('quality').options).map((o) => o.value);

    expect(options).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('stores a chosen quality tier and hands it to the capability service', async () => {
    await type(field<HTMLSelectElement>('quality'), 'low');

    expect(settings.qualityOverride()).toBe('low');
    expect(TestBed.inject(CapabilityService).tier()).toBe('low');
  });

  it('returns quality to detection when auto is chosen again', async () => {
    await type(field<HTMLSelectElement>('quality'), 'low');
    await type(field<HTMLSelectElement>('quality'), 'auto');

    expect(settings.qualityOverride()).toBeNull();
  });

  it('stores mouse sensitivity as a number', async () => {
    await type(field<HTMLInputElement>('sensitivity'), '1.8');

    expect(settings.sensitivity()).toBeCloseTo(1.8, 6);
  });

  it('lets the visitor force reduced motion on, off, or leave it to the system', async () => {
    await type(field<HTMLSelectElement>('motion'), 'reduced');
    expect(settings.reducedMotionOverride()).toBe(true);
    expect(TestBed.inject(CapabilityService).reducedMotion()).toBe(true);

    await type(field<HTMLSelectElement>('motion'), 'full');
    expect(settings.reducedMotionOverride()).toBe(false);

    await type(field<HTMLSelectElement>('motion'), 'auto');
    expect(settings.reducedMotionOverride()).toBeNull();
  });

  it('writes nothing just by being opened, so system preferences stay in charge', () => {
    expect(settings.reducedMotionOverride()).toBeNull();
    expect(settings.qualityOverride()).toBeNull();
    expect(localStorage.getItem('gitplore.settings')).toBeNull();
  });

  it('closes on the close button and on escape', async () => {
    host().querySelector<HTMLButtonElement>('button[data-role="close"]')?.click();
    await fixture.whenStable();
    expect(world.settingsOpen()).toBe(false);

    world.setSettingsOpen(true);
    host()
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(world.settingsOpen()).toBe(false);
  });
});

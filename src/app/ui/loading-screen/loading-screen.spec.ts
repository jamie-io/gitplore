import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingScreen } from './loading-screen';
import { WorldStore } from '../store/world.store';

describe('LoadingScreen', () => {
  let fixture: ComponentFixture<LoadingScreen>;
  let store: WorldStore;

  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [LoadingScreen] }).compileComponents();
    store = TestBed.inject(WorldStore);
    fixture = TestBed.createComponent(LoadingScreen);
  });

  it('shows what is loading and a progress bar while the world loads', async () => {
    store.beginLoading(4, 'Modelle');
    store.reportProgress(1);
    await fixture.whenStable();

    const bar = host().querySelector('progress');
    expect(bar?.getAttribute('max')).toBe('4');
    expect(bar?.getAttribute('value')).toBe('1');
    expect(host().textContent).toContain('Modelle');
  });

  it('turns into a "click to start" gate once the world is ready', async () => {
    store.beginLoading(1, 'Welt');
    store.markReady();
    await fixture.whenStable();

    expect(host().querySelector('progress')).toBeNull();
    expect(host().querySelector('button[data-role="start"]')?.textContent).toContain('Starten');
  });

  it('dismisses itself and tells the page to start when the gate is used', async () => {
    store.markReady();
    await fixture.whenStable();
    const started: number[] = [];
    fixture.componentInstance.start.subscribe(() => started.push(1));

    host().querySelector<HTMLButtonElement>('button[data-role="start"]')?.click();
    await fixture.whenStable();

    expect(started.length).toBe(1);
    expect(store.started()).toBe(true);
  });

  it('is a dialog that names itself', async () => {
    store.beginLoading(1, 'Welt');
    await fixture.whenStable();

    const dialog = host().querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('explains the controls so a keyboard user knows what to do', async () => {
    store.markReady();
    await fixture.whenStable();

    expect(host().textContent).toMatch(/WASD/);
    expect(host().textContent).toMatch(/Pfeiltasten/);
  });

  it('reports a failure instead of a start button', async () => {
    store.fail('WebGL context lost');
    await fixture.whenStable();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('WebGL context lost');
    expect(host().querySelector('button[data-role="start"]')).toBeNull();
  });
});

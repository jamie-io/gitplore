import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { ENGINE, EngineService } from '@engine/engine.service';
import { Hud } from './hud';
import { WorldStore } from '../store/world.store';

/** The HUD only ever asks the engine for stats; §9 puts it behind a token exactly for this. */
const stubEngine = {
  stats: () => ({ fps: 58.6, geometries: 3, textures: 2 }),
} as unknown as EngineService;

describe('Hud', () => {
  let fixture: ComponentFixture<Hud>;
  let store: WorldStore;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const query = (selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Hud],
      providers: [{ provide: ENGINE, useValue: stubEngine }],
    }).compileComponents();
    store = TestBed.inject(WorldStore);
    fixture = TestBed.createComponent(Hud);
  });

  it('shows what is loading and how far along it is', async () => {
    store.beginLoading(4, 'terrain');
    store.reportProgress(1);
    await fixture.whenStable();

    expect(text()).toContain('terrain');
    expect(text()).toContain('25');
  });

  it('names the area once the world is ready', async () => {
    store.markReady();
    store.setArea('Clearing');
    await fixture.whenStable();

    expect(text()).toContain('Clearing');
  });

  it('announces the area politely rather than interrupting', async () => {
    store.markReady();
    store.setArea('Clearing');
    await fixture.whenStable();

    expect(query('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('hides the crosshair while the world is paused', async () => {
    store.markReady();
    await fixture.whenStable();
    expect(query('.crosshair')).not.toBeNull();

    store.toggleMenu();
    await fixture.whenStable();

    expect(query('.crosshair')).toBeNull();
  });

  it('keeps the decorative crosshair out of the accessibility tree', async () => {
    store.markReady();
    await fixture.whenStable();

    expect(query('.crosshair')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the frame rate in the development overlay', async () => {
    store.markReady();
    await fixture.whenStable();

    expect(text()).toContain('59 fps');
  });

  it('shows the error instead of the world when booting fails', async () => {
    store.fail('WebGL context lost');
    await fixture.whenStable();

    expect(text()).toContain('WebGL context lost');
  });
});

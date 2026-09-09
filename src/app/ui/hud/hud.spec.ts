import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { ENGINE, EngineService } from '@engine/engine.service';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Hud } from './hud';
import { WorldStore } from '../store/world.store';

const routeWithQuery = (query: Record<string, string>) => ({
  snapshot: { queryParamMap: convertToParamMap(query) },
});

/** The HUD only ever asks the engine for stats; §9 puts it behind a token exactly for this. */
const stubEngine = {
  stats: () => ({
    fps: 58.6,
    geometries: 3,
    textures: 2,
    frames: 1234,
    sceneGeometries: 5,
    sceneTextures: 4,
  }),
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
      providers: [
        { provide: ENGINE, useValue: stubEngine },
        { provide: ActivatedRoute, useValue: routeWithQuery({ stats: '1' }) },
      ],
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
    store.markStarted();
    await fixture.whenStable();
    expect(query('.crosshair')).not.toBeNull();

    store.toggleMenu();
    await fixture.whenStable();

    expect(query('.crosshair')).toBeNull();
  });

  it('keeps the decorative crosshair out of the accessibility tree', async () => {
    store.markReady();
    store.markStarted();
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

describe('Hud stats overlay', () => {
  const setup = async (query: Record<string, string>) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Hud],
      providers: [
        { provide: ENGINE, useValue: stubEngine },
        { provide: ActivatedRoute, useValue: routeWithQuery(query) },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Hud);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('exposes the rendered frame count when stats are requested', async () => {
    const host = await setup({ stats: '1' });

    expect(host.querySelector('.stats')?.getAttribute('data-frames')).toBe('1234');
  });

  it('exposes the GPU counts for the memory e2e', async () => {
    const host = await setup({ stats: '1' });

    expect(host.querySelector('.stats')?.getAttribute('data-geometries')).toBe('3');
    expect(host.querySelector('.stats')?.getAttribute('data-textures')).toBe('2');
    expect(host.querySelector('.stats')?.getAttribute('data-scene-geometries')).toBe('5');
    expect(host.querySelector('.stats')?.getAttribute('data-scene-textures')).toBe('4');
  });

  it('shows frame rate and GPU counts when stats are requested', async () => {
    const host = await setup({ stats: '1' });

    expect(host.querySelector('.stats')?.textContent).toMatch(/59 fps.*3 geo.*2 tex/);
  });
});

describe('Hud interaction prompt and navigation', () => {
  let fixture: ComponentFixture<Hud>;
  let store: WorldStore;

  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Hud],
      providers: [
        { provide: ENGINE, useValue: stubEngine },
        { provide: ActivatedRoute, useValue: routeWithQuery({}) },
      ],
    }).compileComponents();
    store = TestBed.inject(WorldStore);
    fixture = TestBed.createComponent(Hud);
    store.markReady();
    await fixture.whenStable();
  });

  it('keeps the live region present but empty while nothing is in reach', () => {
    expect(host().querySelector('.prompt')?.textContent?.trim()).toBe('');
  });

  it('prompts with the key and the label once something is in reach', async () => {
    store.setNearby({
      id: 'portal',
      position: { x: 0, y: 0, z: 0 } as never,
      radius: 3,
      prompt: 'Deslopify betreten',
      onInteract: () => undefined,
    });
    await fixture.whenStable();

    const prompt = host().querySelector('.prompt');
    expect(prompt?.textContent).toContain('E');
    expect(prompt?.textContent).toContain('Deslopify betreten');
    expect(prompt?.getAttribute('aria-live')).toBe('polite');
  });

  it('offers the menu as a real button', async () => {
    const button = host().querySelector<HTMLButtonElement>('button[data-role="menu"]');
    expect(button?.textContent).toContain('Menü');

    button?.click();
    await fixture.whenStable();

    expect(store.menuOpen()).toBe(true);
  });

  it('links to the screen-reader friendly project list', () => {
    const link = host().querySelector<HTMLAnchorElement>('a[data-role="list"]');

    expect(link?.getAttribute('href')).toBe('/projects');
  });
});

describe('Hud during an in-world demo', () => {
  it('shows the demo hint instead of the interaction prompt', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Hud],
      providers: [
        { provide: ENGINE, useValue: stubEngine },
        { provide: ActivatedRoute, useValue: routeWithQuery({}) },
      ],
    }).compileComponents();
    const store = TestBed.inject(WorldStore);
    const fixture = TestBed.createComponent(Hud);
    store.markReady();
    store.setDemoActive(true, 'E: Originaltitel · Esc: verlassen');
    await fixture.whenStable();

    const hint = (fixture.nativeElement as HTMLElement).querySelector('.prompt');
    expect(hint?.textContent).toContain('Originaltitel');
  });
});

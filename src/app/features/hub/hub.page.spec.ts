import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DEVICE_CAPABILITIES, DeviceCapabilities } from '@engine/capability.service';
import { ENGINE, EngineService } from '@engine/engine.service';
import { InputService } from '@engine/input.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldScene } from '@engine/world-object';
import { WorldStore } from '@ui/store/world.store';
import { HubPage } from './hub.page';

const CAPABLE: DeviceCapabilities = {
  webgl2: true,
  rendererDescription: 'Apple M2',
  hardwareConcurrency: 10,
  devicePixelRatio: 2,
  reducedMotion: false,
  coarsePointer: false,
};

/** The engine without a renderer: the page's lifecycle and bridging are what is under test. */
class StubEngine {
  attached = 0;
  detached = 0;
  world: WorldScene | null = null;
  readonly player = new PlayerController();
  onNearbyChange: EngineService['onNearbyChange'] = null;
  readonly nearby = null;

  stats() {
    return { fps: 0, geometries: 0, textures: 0, frames: 0, sceneGeometries: 0, sceneTextures: 0 };
  }
  private detachInput: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.attached++;
    this.detachInput = TestBed.inject(InputService).attach(canvas);
  }
  detach(): void {
    this.detached++;
    this.detachInput?.();
  }
  resize(): void {
    // no renderer
  }
  refreshQuality(): void {
    // no renderer
  }
  setScene(world: WorldScene): void {
    // Landmarks are built in the scene's constructor; there is no renderer to init them for.
    this.world = world;
  }
  setThrottle(): void {
    // no renderer
  }
  setPaused(): void {
    // no renderer
  }
}

describe('HubPage', () => {
  let fixture: ComponentFixture<HubPage>;
  let engine: StubEngine;
  let http: HttpTestingController;
  let store: WorldStore;

  /** Lets the page run its boot up to the manifest request, then answers it. */
  async function bootWithoutManifest(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    http
      .match('assets/manifest.json')
      .forEach((r) => r.flush('', { status: 404, statusText: 'Not Found' }));
    await Promise.resolve();
    await Promise.resolve();
    TestBed.tick();
  }

  const press = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));

  beforeEach(async () => {
    TestBed.resetTestingModule();
    engine = new StubEngine();
    await TestBed.configureTestingModule({
      imports: [HubPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: ENGINE, useValue: engine },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(WorldStore);
    fixture = TestBed.createComponent(HubPage);
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('never attaches the engine when the page was left while still booting', async () => {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();

    fixture.destroy();
    http
      .match('assets/manifest.json')
      .forEach((r) => r.flush('', { status: 404, statusText: 'Not Found' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.attached).toBe(0);
  });

  it('boots the world once content and manifest have answered', async () => {
    await bootWithoutManifest();

    expect(engine.attached).toBe(1);
    expect(store.phase()).toBe('ready');
    expect(engine.world?.id).toBe('hub');
  });

  it('fulfils a demo request from the panel once the world is ready', async () => {
    await bootWithoutManifest();
    store.markStarted();

    store.requestDemo('deslopify');
    TestBed.tick();

    expect(store.demoActive()).toBe(true);
    expect(store.demoRequest()).toBeNull();
    expect(store.inputMode()).toBe('demo');
  });

  it('ends a running demo and forgets overlay state when the page goes away', async () => {
    await bootWithoutManifest();
    store.markStarted();
    store.requestDemo('deslopify');
    TestBed.tick();
    store.setMenuOpen(true);

    fixture.destroy();

    expect(store.demoActive()).toBe(false);
    expect(store.menuOpen()).toBe(false);
    expect(store.inputMode()).toBe('world');
    expect(engine.detached).toBe(1);
  });

  it('ignores the menu key until the visitor has passed the start gate', async () => {
    await bootWithoutManifest();

    press('KeyM');
    expect(store.menuOpen()).toBe(false);

    store.markStarted();
    press('KeyM');
    expect(store.menuOpen()).toBe(true);
  });

  it('marks the world inert while an overlay owns the input', async () => {
    await bootWithoutManifest();
    // jsdom knows the property, not the attribute; the e2e suite checks the attribute in Chrome.
    const canvas = (fixture.nativeElement as HTMLElement).querySelector(
      'canvas',
    ) as HTMLCanvasElement & {
      inert?: boolean;
    };
    expect(canvas.inert).toBe(true);

    store.markStarted();
    TestBed.tick();

    expect(canvas.inert).toBe(false);
  });
});

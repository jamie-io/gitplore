import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DEVICE_CAPABILITIES } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { CONTENT_SOURCE } from '@content/content-source';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from '@ui/store/world.store';
import { HubPage } from './hub.page';
import { CAPABLE } from '@engine/testing/world-context';
import { StubEngine } from '@engine/testing/stub-engine';

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
        // Content resolves at once here, same as `StaticContentSource` did: `bootWithoutManifest`
        // only flushes the manifest request, so content must not need an HTTP round trip too.
        {
          provide: CONTENT_SOURCE,
          useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
        },
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

  // Deslopify's demo now lives behind its own portal (spec §5), so the hub has no landmark left
  // that can run one; `startDemo` finds nothing with an `enter` and no-ops. Task 9 rewires this
  // request through the scene director once a destination is open.
  it('clears a demo request from the panel, though no hub landmark can run one yet', async () => {
    await bootWithoutManifest();
    store.markStarted();

    store.requestDemo('deslopify');
    TestBed.tick();

    expect(store.demoRequest()).toBeNull();
    expect(store.demoActive()).toBe(false);
    expect(store.inputMode()).toBe('world');
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

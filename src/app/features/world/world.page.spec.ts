import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { CapabilityService, DEVICE_CAPABILITIES } from '@engine/capability.service';
import { AudioService } from '@engine/audio/audio.service';
import { ENGINE } from '@engine/engine.service';
import { InputService } from '@engine/input.service';
import { CONTENT_SOURCE } from '@content/content-source';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { SettingsStore } from '@ui/store/settings.store';
import { WorldStore } from '@ui/store/world.store';
import { WorldPage } from './world.page';
import { SceneDirector } from './scene-director';
import { CAPABLE } from '@engine/testing/world-context';
import { StubEngine } from '@engine/testing/stub-engine';
import { arrivalShot } from '@engine/camera/camera-shot';

/**
 * A stub for the `info` leaf: `WorldPage` only cares that the route was matched, not what it
 * renders, and the real `ProjectPanel` drags in content and README machinery this suite does not
 * need. It keeps a real `slug` input, though, so a test can prove params actually inherit down
 * through the componentless `p/:slug` route (spec §6) — the single most consequential unverified
 * thing on this branch, since a break here would silently show every project as "not found".
 */
@Component({ template: '' })
class StubInfoPanel {
  readonly slug = input<string>();
}

/** A stub for the `kontakt` leaf: the page only needs to know the contact route is open. */
@Component({ template: '' })
class StubContactDialog {}

describe('WorldPage', () => {
  let fixture: ComponentFixture<WorldPage>;
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
    // The director's build crosses a genuine dynamic `import()` for the environment chunk, so no
    // fixed number of ticks is enough: under a loaded machine that chunk can outlast any count we
    // would pick, and this suite ran green for weeks before it did. Wait on the condition itself,
    // with a deadline that says what went wrong — a loop that merely falls through reports the
    // give-up as `expected 'loading' to be 'ready'`, which reads like a product bug.
    await settle(() => store.phase() !== 'loading', 'the world to finish booting');
    TestBed.tick();
  }

  /**
   * Ticks change detection until `done()` holds, or fails saying what never happened. Polls on
   * macrotasks because the awaited work crosses a real `import()`, which no microtask drain covers.
   */
  async function settle(
    done: () => boolean,
    description: string,
    timeoutMs = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!done()) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  }

  const press = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));

  beforeEach(async () => {
    TestBed.resetTestingModule();
    engine = new StubEngine();
    await TestBed.configureTestingModule({
      imports: [WorldPage],
      providers: [
        // Mirrors the shape of the real `p/:slug` (componentless) → `info` route (spec §6): since
        // this component is created directly rather than by a root outlet, its injected
        // `ActivatedRoute` stands in for `WorldPage`'s own node, so the top-level entry here plays
        // the part its children play in `app.routes.ts`.
        provideRouter(
          [
            { path: 'p/:slug', children: [{ path: 'info', component: StubInfoPanel }] },
            { path: 'kontakt', component: StubContactDialog },
          ],
          // Matches `app.config.ts`: without this, no route ever fills a component `input()`,
          // regardless of params inheritance, and the test below would pass for the wrong reason.
          withComponentInputBinding(),
        ),
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
    fixture = TestBed.createComponent(WorldPage);
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

  // Deslopify's demo now lives behind its own portal (spec §5), so the start world has no landmark
  // left that can run one; the director's `startDemo` finds nothing current and no-ops.
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

  it('flips the stored view between the shoulder and the head on V', async () => {
    await bootWithoutManifest();
    // Only once the world has the input: until then the start gate is a modal dialog, and the
    // view key is not one of the actions that reach through one.
    store.markStarted();
    TestBed.tick();
    const settings = TestBed.inject(SettingsStore);
    expect(settings.viewMode()).toBe('third');

    press('KeyV');
    expect(settings.viewMode()).toBe('first');

    press('KeyV');
    expect(settings.viewMode()).toBe('third');
  });

  it('forwards R to the active world restart hook', async () => {
    await bootWithoutManifest();
    store.markStarted();
    TestBed.tick();
    await TestBed.inject(Router).navigate(['/p', 'deslopify']);
    await settle(() => engine.world?.id === 'project:deslopify', 'Deslopify world');

    const restart = vi.spyOn(TestBed.inject(SceneDirector), 'restart');
    press('KeyR');

    expect(restart).toHaveBeenCalledOnce();
  });

  it('leaves a repo world when Escape skips its arrival shot', async () => {
    await bootWithoutManifest();
    store.markStarted();
    TestBed.tick();
    await TestBed.inject(Router).navigate(['/p', 'novaverta']);
    await settle(() => engine.world?.id === 'project:novaverta', 'Novaverta world');

    engine.playShot(
      arrivalShot(
        {
          position: { x: 0, y: 2, z: 0 },
          target: { x: 0, y: 1, z: -1 },
        },
        false,
      ),
    );
    expect(store.shot()).toBe('arrival');

    press('Escape');
    await settle(() => TestBed.inject(Router).url === '/', 'the repo world to close');

    expect(TestBed.inject(Router).url).toBe('/');
  });

  describe('stations', () => {
    async function startedWorld(): Promise<SceneDirector> {
      await bootWithoutManifest();
      store.markStarted();
      TestBed.tick();
      return TestBed.inject(SceneDirector);
    }

    it('glides to a station on its number and to the portal on 0', async () => {
      const glideTo = vi.spyOn(await startedWorld(), 'glideTo');

      press('Digit3');
      press('Digit0');
      press('Numpad8');

      expect(glideTo.mock.calls).toEqual([[3], [0], [8]]);
    });

    it('does not glide while an overlay has the input', async () => {
      const glideTo = vi.spyOn(await startedWorld(), 'glideTo');
      store.setMenuOpen(true);
      TestBed.tick();

      press('Digit3');

      expect(glideTo).not.toHaveBeenCalled();
    });

    it('fulfils and clears a glide a chip asked for', async () => {
      const glideTo = vi.spyOn(await startedWorld(), 'glideTo');

      store.requestGlide(4);
      TestBed.tick();

      expect(glideTo).toHaveBeenCalledExactlyOnceWith(4);
      expect(store.glideRequest()).toBeNull();
    });

    it('skips a running shot on any action key and on a click into the world', async () => {
      await startedWorld();

      press('KeyV');
      expect(engine.skips).toBe(1);

      (fixture.nativeElement as HTMLElement).querySelector('canvas')!.click();
      expect(engine.skips).toBe(2);
    });

    it('stops a glide on Escape instead of leaving the world', async () => {
      await startedWorld();
      await TestBed.inject(Router).navigate(['/p', 'novaverta']);
      await settle(() => engine.world?.id === 'project:novaverta', 'Novaverta world');
      engine.activeGlide = { points: [], length: 1, duration: 1, endYaw: 0 };
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

      press('Escape');

      expect(engine.gliding()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
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

  it('asks the director for the start world when it boots at the root route', async () => {
    await bootWithoutManifest();

    expect(engine.world?.id).toBe('hub');
  });

  it('asks the director for a repo world when the route names a project', async () => {
    await TestBed.inject(Router).navigate(['/p', 'novaverta']);
    await bootWithoutManifest();

    expect(engine.world?.id).toBe('project:novaverta');
  });

  it('keeps the world in charge of the input while standing in a repo world', async () => {
    await bootWithoutManifest();
    store.markStarted();
    await TestBed.inject(Router).navigate(['/p', 'novaverta']);
    TestBed.tick();

    expect(fixture.nativeElement.getAttribute('data-input-mode')).toBe('world');
  });

  it('mirrors capture transitions into the store so the HUD and page agree', async () => {
    await bootWithoutManifest();
    store.markStarted();
    TestBed.tick();
    const input = TestBed.inject(InputService);

    input.capture('Aufstehen');
    expect(store.inputMode()).toBe('captured');
    TestBed.tick();
    expect(fixture.nativeElement.getAttribute('data-input-mode')).toBe('captured');

    input.releaseCapture();
    expect(store.inputMode()).toBe('world');
  });

  for (const policy of [
    { tier: 'low', paused: true, throttle: null },
    { tier: 'medium', paused: false, throttle: 15 },
    { tier: 'high', paused: false, throttle: 15 },
  ] as const) {
    it(`applies ${policy.tier}-tier rendering policy while the panel is open`, async () => {
      await TestBed.inject(Router).navigate(['/p', 'novaverta']);
      await bootWithoutManifest();
      TestBed.inject(CapabilityService).override(policy.tier);
      TestBed.tick();

      const setPaused = vi.spyOn(engine, 'setPaused');
      const setThrottle = vi.spyOn(engine, 'setThrottle');
      setPaused.mockClear();
      setThrottle.mockClear();

      await TestBed.inject(Router).navigate(['/p', 'novaverta', 'info']);
      TestBed.tick();

      expect(setPaused).toHaveBeenLastCalledWith(policy.paused);
      expect(setThrottle).toHaveBeenLastCalledWith(policy.throttle);

      await TestBed.inject(Router).navigate(['/p', 'novaverta']);
      TestBed.tick();

      expect(setPaused).toHaveBeenLastCalledWith(false);
      expect(setThrottle).toHaveBeenLastCalledWith(null);
    });
  }

  it('hangs the audio on the render loop rather than on change detection', async () => {
    const frame = vi.spyOn(TestBed.inject(AudioService), 'frame');
    await bootWithoutManifest();

    engine.tickables.forEach((tickable) => tickable.update(0.016));

    expect(frame).toHaveBeenCalledWith(0.016, engine.player);
  });

  it('pushes the stored volume into the engine, the way the quality tier travels', async () => {
    const setVolume = vi.spyOn(TestBed.inject(AudioService), 'setVolume');
    await bootWithoutManifest();

    TestBed.inject(SettingsStore).setVolume(0.7);
    TestBed.tick();

    expect(setVolume).toHaveBeenLastCalledWith(0.7);
  });

  it('ducks the world while the panel is open and lets it back up afterwards', async () => {
    const setDucked = vi.spyOn(TestBed.inject(AudioService), 'setDucked');
    await TestBed.inject(Router).navigate(['/p', 'novaverta']);
    await bootWithoutManifest();

    await TestBed.inject(Router).navigate(['/p', 'novaverta', 'info']);
    TestBed.tick();
    expect(setDucked).toHaveBeenLastCalledWith(true);

    await TestBed.inject(Router).navigate(['/p', 'novaverta']);
    TestBed.tick();
    expect(setDucked).toHaveBeenLastCalledWith(false);
  });

  it('lets go of the audio context when the page goes', async () => {
    const dispose = vi.spyOn(TestBed.inject(AudioService), 'dispose');
    await bootWithoutManifest();

    fixture.destroy();

    expect(dispose).toHaveBeenCalled();
  });

  it('asks the director for the start world exactly once on a cold boot', async () => {
    // The route-driven build effect used to infer "boot has claimed the scene" from
    // `store.phase()`, and the `'booting'` → `'loading'` transition re-ran it before `boot()` had
    // set `shown` — calling `show()` a second time on every cold boot.
    const show = vi.spyOn(TestBed.inject(SceneDirector), 'show');

    await bootWithoutManifest();

    expect(show).toHaveBeenCalledTimes(1);
  });

  it('never builds a world when boot fails, since the engine was never attached', async () => {
    TestBed.resetTestingModule();
    const failingEngine = new StubEngine();
    await TestBed.configureTestingModule({
      imports: [WorldPage],
      providers: [
        provideRouter(
          [
            { path: 'p/:slug', children: [{ path: 'info', component: StubInfoPanel }] },
            { path: 'kontakt', component: StubContactDialog },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: ENGINE, useValue: failingEngine },
        // A source that never answers with a portfolio: `content.error()` becomes non-null and
        // `boot()`'s own `try`/`catch` reports it via `store.fail()` before ever attaching.
        {
          provide: CONTENT_SOURCE,
          useValue: { projects: () => Promise.reject(new Error('boom')) },
        },
      ],
    }).compileComponents();
    const failingStore = TestBed.inject(WorldStore);
    const failingFixture = TestBed.createComponent(WorldPage);
    document.body.appendChild(failingFixture.nativeElement);

    TestBed.tick();
    // Real macrotask ticks, not just microtasks: a director build crosses a genuine dynamic
    // `import()`, so a regression that lets the build effect fire despite the failed boot needs
    // this much room to actually reach `engine.setScene` before the assertions below would catch
    // it — settling on microtasks alone would pass this test for the wrong reason.
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
    }

    expect(failingStore.phase()).toBe('error');
    // The bug this guards against: a director that built a world here would call
    // `engine.setScene` on an engine `attach()` never reached — silently, behind the error screen.
    expect(failingEngine.attached).toBe(0);
    expect(failingEngine.world).toBeNull();

    failingFixture.nativeElement.remove();
  });

  it('does not open the menu on top of a panel activated in the same change-detection pass', async () => {
    await bootWithoutManifest();
    store.markStarted();

    await TestBed.inject(Router).navigate(['/p', 'novaverta', 'info']);
    // No `TestBed.tick()` here, on purpose: `routeState` is a `toSignal` on `NavigationEnd` and has
    // already flipped `panel` to `true`, but the effect that copies it into `store.panelOpen()`
    // waits for the next flush and has not run yet. That gap is exactly what `onAction`'s menu
    // gate must survive — a key landing here must not stack the project menu on the just-activated
    // panel (two `aria-modal` dialogs at once).
    press('KeyM');

    expect(store.menuOpen()).toBe(false);
  });

  it('inherits :slug down through the componentless p/:slug route to the info panel', async () => {
    await bootWithoutManifest();
    await TestBed.inject(Router).navigate(['/p', 'novaverta', 'info']);
    TestBed.tick();

    const panel = fixture.debugElement.query(By.directive(StubInfoPanel))?.componentInstance as
      StubInfoPanel | undefined;

    // If this fails, the `p/:slug` node's lack of a `component`/`loadComponent` is not enough on
    // its own for `withComponentInputBinding()` to inherit params past it — stop and report rather
    // than reaching for `paramsInheritanceStrategy: 'always'` unasked.
    expect(panel?.slug()).toBe('novaverta');
  });

  it('hands the input to the contact dialog and keeps the start world under it', async () => {
    await bootWithoutManifest();
    store.markStarted();
    const hub = engine.world;
    await TestBed.inject(Router).navigate(['/kontakt']);
    TestBed.tick();

    expect(store.contactOpen()).toBe(true);
    expect(store.inputMode()).toBe('ui');
    expect(engine.world).toBe(hub);
    // Two modal dialogs at once is exactly what the menu gate must prevent.
    press('KeyM');
    expect(store.menuOpen()).toBe(false);

    press('Escape');
    await settle(() => !store.contactOpen(), 'the contact dialog to close');

    expect(TestBed.inject(Router).url).toBe('/');
    expect(store.inputMode()).toBe('world');
    // Opening and closing the dialog never rebuilt the world under it.
    expect(engine.world).toBe(hub);
    expect(hub?.id).toBe('hub');
  });

  it('keeps the start gate out of the way of a deep-linked contact dialog', async () => {
    await TestBed.inject(Router).navigate(['/kontakt']);
    await bootWithoutManifest();

    expect(fixture.debugElement.query(By.directive(StubContactDialog))).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-loading-screen')).toBeNull();
  });
});

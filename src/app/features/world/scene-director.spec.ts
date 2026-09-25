import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AudioService } from '@engine/audio/audio.service';
import { ENGINE } from '@engine/engine.service';
import { DEVICE_CAPABILITIES } from '@engine/capability.service';
import { CAPABLE, stubContext } from '@engine/testing/world-context';
import { StubEngine } from '@engine/testing/stub-engine';
import { MOMENT } from '@engine/camera/camera-shot';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import type { GroundPoint, StationSpec } from '@engine/stations/station';
import type { WorldScene } from '@engine/world-object';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from '@ui/store/world.store';
import { GALERIE, LICHTUNG } from '@world/environments/mood';
import { HubScene } from '@world/hub/hub.scene';
import { InWorldDemo, ProjectScene, ProjectSceneOptions } from '@world/project/project.scene';
import { SceneDirector } from './scene-director';

describe('SceneDirector', () => {
  let engine: StubEngine;
  let director: SceneDirector;
  let store: WorldStore;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    engine = new StubEngine();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENGINE, useValue: engine },
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: CONTENT_SOURCE, useValue: { projects: async () => PROJECT_FIXTURES } },
      ],
    });
    director = TestBed.inject(SceneDirector);
    store = TestBed.inject(WorldStore);
    await TestBed.inject(ContentService).ready;
  });

  it('builds the start world when no project is named', async () => {
    await director.show(null);

    expect(engine.world).toBeInstanceOf(HubScene);
  });

  it('builds a repository’s own world for its slug', async () => {
    await director.show('novaverta');

    expect(engine.world).toBeInstanceOf(ProjectScene);
    expect(engine.world?.id).toBe('project:novaverta');
  });

  it('hands the audio the sound of the place it just built', async () => {
    const setWorld = vi.spyOn(TestBed.inject(AudioService), 'setWorld');

    await director.show(null);
    expect(setWorld).toHaveBeenLastCalledWith(LICHTUNG.audio);

    await director.show('novaverta');
    expect(setWorld).toHaveBeenLastCalledWith(GALERIE.audio);
  });

  it('stands the player in the repo world it just built', async () => {
    await director.show('novaverta');
    const scene = engine.world as ProjectScene;

    expect(engine.player.position.x).toBeCloseTo(scene.arrival.position.x, 5);
    expect(engine.player.position.z).toBeCloseTo(scene.arrival.position.z, 5);
  });

  it('puts the returning visitor back at the portal they walked into', async () => {
    await director.show('novaverta');
    await director.show(null);

    const hub = engine.world as HubScene;
    const landmark = hub.landmarkFor('novaverta');
    expect(landmark).toBeDefined();
    expect(engine.player.position.x).toBeCloseTo(landmark!.spawn.x, 5);
    expect(engine.player.position.z).toBeCloseTo(landmark!.spawn.z, 5);
  });

  it('builds no world at all for a slug nothing matches', async () => {
    await director.show(null);
    const before = engine.world;
    const scenesSetBefore = engine.scenesSet;

    await director.show('does-not-exist');

    // The start world stays and the panel explains itself — the behaviour the E2E suite pins.
    // Asserting only `engine.world` would also pass a director that built a whole environment and
    // scene and then threw it away, so pin the stronger claim: nothing was built at all, and the
    // swap flag settles back down rather than being left raised.
    expect(engine.world).toBe(before);
    expect(engine.scenesSet).toBe(scenesSetBefore);
    expect(store.swapping()).toBe(false);
  });

  it('builds the start world for an unknown slug on a cold boot, panel or not', async () => {
    // A deep link straight to `/p/does-not-exist/info` has no earlier world to leave standing —
    // unlike the case above, this is the very first `show()` call. The panel still needs a world
    // behind it, so this must fall through and build the start world rather than nothing at all.
    await director.show('does-not-exist');

    expect(engine.world).toBeInstanceOf(HubScene);
    expect(store.area()).toBe('Lichtung');
  });

  it('tells the HUD which environment the world stands in', async () => {
    await director.show(null);
    expect(store.environment()).toBe('clearing');

    await director.show('novaverta');
    expect(store.environment()).toBe('showroom');

    await director.show('deslopify');
    expect(store.environment()).toBe('jungle');
  });

  it('builds once when two navigations overlap, and disposes the old world once', async () => {
    await director.show(null);
    const first = engine.world!;
    // Counted by hand rather than with `vi.spyOn`, matching the prototype-dispose counter below.
    let disposals = 0;
    const dispose = first.dispose.bind(first);
    first.dispose = () => {
      disposals++;
      dispose();
    };
    // The invariant under test is not just "the outgoing world is disposed once" but also "the
    // losing build is never disposed" — a director that tidied up the loser with `dispose()`
    // would still satisfy the assertions above alone, so watch every `ProjectScene` too.
    let projectDisposals = 0;
    const originalProjectDispose = ProjectScene.prototype.dispose;
    ProjectScene.prototype.dispose = function (this: ProjectScene) {
      projectDisposals++;
      originalProjectDispose.call(this);
    };

    try {
      await Promise.all([director.show('novaverta'), director.show('poetzscher')]);
    } finally {
      ProjectScene.prototype.dispose = originalProjectDispose;
    }

    expect(engine.world?.id).toBe('project:poetzscher');
    expect(disposals).toBe(1);
    expect(engine.scenesSet).toBe(2);
    expect(projectDisposals).toBe(0);
  });

  it('announces the place and the project for screen readers', async () => {
    await director.show('novaverta');

    expect(store.area()).toBe('Showroom — Phönix Industriedienstleistungen');
    expect(store.currentProject()).toBe('novaverta');
  });

  it('snapshots live hub landmark distances when the menu opens', async () => {
    await director.show(null);
    const hub = engine.world as HubScene;

    store.setMenuOpen(true);
    TestBed.tick();

    for (const landmark of hub.landmarks) {
      const expected = Math.hypot(
        landmark.position.x - engine.player.position.x,
        landmark.position.z - engine.player.position.z,
      );
      expect(store.travelDistances().get(landmark.project.slug)).toBeCloseTo(expected, 5);
    }
  });

  it('takes one distance snapshot per menu opening', async () => {
    await director.show(null);

    store.setMenuOpen(true);
    TestBed.tick();
    const firstSnapshot = store.travelDistances();

    store.setArea('Lichtung');
    TestBed.tick();
    expect(store.travelDistances()).toBe(firstSnapshot);

    store.setMenuOpen(false);
    TestBed.tick();
    store.setMenuOpen(true);
    TestBed.tick();
    expect(store.travelDistances()).not.toBe(firstSnapshot);
  });

  it('does not expose distances inside a repository world', async () => {
    await director.show('novaverta');

    store.setMenuOpen(true);
    TestBed.tick();

    expect(store.travelDistances().size).toBe(0);
  });

  it('refreshes hub distances after a world change while the menu stays open', async () => {
    await director.show(null);
    store.setMenuOpen(true);
    TestBed.tick();
    const firstSnapshot = store.travelDistances();

    await director.show('novaverta');
    TestBed.tick();
    expect(store.travelDistances().size).toBe(0);

    await director.show(null);
    TestBed.tick();

    expect(store.travelDistances().size).toBeGreaterThan(0);
    expect(store.travelDistances()).not.toBe(firstSnapshot);
  });

  it('raises and clears the swap flag around a build', async () => {
    const pending = director.show('novaverta');
    expect(store.swapping()).toBe(true);

    await pending;
    expect(store.swapping()).toBe(false);
  });

  it('builds the named world even when content has not loaded yet', async () => {
    // A visitor can open /p/:slug directly — the primary entry path for this portfolio — before
    // the portfolio has finished loading. Deliberately not awaiting `ContentService.ready` here:
    // that is the scenario under test. A fresh module is needed because the outer `beforeEach`
    // already resolved content on the shared `director`.
    TestBed.resetTestingModule();
    const lateEngine = new StubEngine();
    let resolveProjects!: (projects: typeof PROJECT_FIXTURES) => void;
    const projects = new Promise<typeof PROJECT_FIXTURES>((resolve) => {
      resolveProjects = resolve;
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENGINE, useValue: lateEngine },
        { provide: DEVICE_CAPABILITIES, useValue: CAPABLE },
        { provide: CONTENT_SOURCE, useValue: { projects: () => projects } },
      ],
    });
    const lateDirector = TestBed.inject(SceneDirector);

    const pending = lateDirector.show('novaverta');
    resolveProjects(PROJECT_FIXTURES);
    await pending;

    expect(lateEngine.world).toBeInstanceOf(ProjectScene);
    expect(lateEngine.world?.id).toBe('project:novaverta');
  });

  afterEach(() => vi.restoreAllMocks());

  describe('stations and camera shots', () => {
    const OVERVIEW = { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } };
    const PITCH = { title: 'Novaverta', line: 'Eine Zeile · One line' };
    const PORTAL_STAND = { x: 0, z: 6, yaw: 0 };
    const WAYPOINT: GroundPoint = { x: 5, z: -20 };
    const STATIONS: readonly StationSpec[] = ['eins', 'zwei', 'drei'].map((id, i) => ({
      id,
      name: id,
      stand: { x: 0, z: -10 * (i + 1), yaw: 0.5 * i },
      trigger: 3,
      plate: () => ({ kicker: `Station ${i + 1}`, title: id, text: `${id} text`, en: `${id} en` }),
    }));

    /** Session storage that keeps what it is told, fresh for every test. */
    function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
      const items = new Map<string, string>();
      return {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => void items.set(key, value),
      };
    }

    /**
     * Dresses novaverta's scene as a world that declares stations would be, the moment it reaches
     * the engine and before the director places it. No real world declares them yet.
     */
    function dressNovaverta(): void {
      const setScene = engine.setScene.bind(engine);
      engine.setScene = (world: WorldScene) => {
        if (world.id === 'project:novaverta') {
          // Own properties, so they stand in front of `ProjectScene`'s getters for these.
          Object.defineProperties(world, {
            stations: { value: STATIONS },
            portalStand: { value: PORTAL_STAND },
            overview: { value: OVERVIEW },
            pitch: { value: PITCH },
            glidePath: { value: (from: GroundPoint, to: GroundPoint) => [from, WAYPOINT, to] },
          });
        }
        setScene(world);
      };
    }

    /** One frame of the loop, for the tickables the director hung on it. */
    function frame(): void {
      engine.tickables.forEach((tickable) => tickable.update(1 / 60));
    }

    function standAt(x: number, z: number): void {
      engine.player.position.set(x, engine.player.position.y, z);
      frame();
    }

    beforeEach(() => {
      vi.stubGlobal('sessionStorage', memoryStorage());
      store.markStarted();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it('plays the arrival over the overview on the first visit, with the pitch', async () => {
      dressNovaverta();

      await director.show('novaverta');

      expect(engine.shots.map((shot) => shot.kind)).toEqual(['arrival']);
      expect(engine.shots[0].pose).toBe(OVERVIEW);
      expect(store.pitch()).toEqual(PITCH);
      expect(store.shot()).toBe('arrival');
    });

    it('does not play it again on a later visit in the same session', async () => {
      dressNovaverta();
      await director.show('novaverta');
      await director.show(null);

      await director.show('novaverta');

      expect(engine.shots.length).toBe(1);
      expect(store.pitch()).toBeNull();
    });

    it('plays it when session storage throws, which counts as a first visit', async () => {
      const throwing = () => {
        throw new Error('storage disabled');
      };
      vi.stubGlobal('sessionStorage', { getItem: throwing, setItem: throwing });
      dressNovaverta();

      await director.show('novaverta');

      expect(engine.shots.map((shot) => shot.kind)).toEqual(['arrival']);
    });

    it('holds the arrival until the visitor clicks through the start gate', async () => {
      TestBed.inject(WorldStore).started.set(false);
      dressNovaverta();

      await director.show('novaverta');
      expect(engine.shots.length).toBe(0);

      store.markStarted();
      TestBed.tick();

      expect(engine.shots.map((shot) => shot.kind)).toEqual(['arrival']);
      expect(store.pitch()).toEqual(PITCH);
    });

    it('leaves the bar empty and plays nothing in a world without stations', async () => {
      await director.show('novaverta');
      standAt(0, -10);

      expect(store.stations()).toEqual([]);
      expect(store.plate()).toBeNull();
      expect(engine.shots.length).toBe(0);
    });

    it('fills the bar on arrival and follows the player from station to station', async () => {
      dressNovaverta();
      await director.show('novaverta');

      expect(store.stations().map((chip) => chip.state)).toEqual(['next', 'open', 'open']);

      standAt(0, -10);
      expect(store.stations().map((chip) => chip.state)).toEqual(['here', 'next', 'open']);
      expect(store.plate()?.title).toBe('eins');

      standAt(0, -15);
      expect(store.stations().map((chip) => chip.state)).toEqual(['visited', 'next', 'open']);
      expect(store.plate()).toBeNull();
    });

    it('writes the store only when the bar or the plate changed', async () => {
      dressNovaverta();
      await director.show('novaverta');
      standAt(0, -10);
      const chips = store.stations();
      const plate = store.plate();

      standAt(0.5, -10);

      expect(store.stations()).toBe(chips);
      expect(store.plate()).toBe(plate);
    });

    it("glides along the scene's path to a station's stand", async () => {
      dressNovaverta();
      await director.show('novaverta');
      const { x, z } = engine.player.position;

      director.glideTo(2);

      expect(engine.glides.length).toBe(1);
      const glide = engine.glides[0];
      expect(glide.points[0].x).toBeCloseTo(x, 6);
      expect(glide.points[0].z).toBeCloseTo(z, 6);
      expect(glide.points).toContainEqual(WAYPOINT);
      expect(glide.points.at(-1)).toEqual({ x: 0, z: -20 });
      expect(glide.endYaw).toBe(0.5);
    });

    it('glides to the portal stand on 0', async () => {
      dressNovaverta();
      await director.show('novaverta');
      standAt(0, -30);

      director.glideTo(0);

      expect(engine.glides[0].points.at(-1)).toEqual({ x: 0, z: 6 });
    });

    it('skips a running shot before it glides', async () => {
      dressNovaverta();
      await director.show('novaverta');

      director.glideTo(1);

      expect(engine.skips).toBe(1);
    });

    it('does not glide in a world without stations, or to a station it lacks', async () => {
      await director.show('novaverta');
      director.glideTo(1);
      expect(engine.glides.length).toBe(0);

      dressNovaverta();
      await director.show('poetzscher');
      await director.show('novaverta');
      director.glideTo(8);
      expect(engine.glides.length).toBe(0);
    });

    describe('while gliding', () => {
      /** Arrived at the first station, then off to the third, over the second's stand. */
      async function glidingPastTheSecond(): Promise<void> {
        dressNovaverta();
        await director.show('novaverta');
        standAt(0, -10);
        director.glideTo(3);
        expect(engine.gliding()).toBe(true);
        standAt(0, -20);
      }
      const states = () => store.stations().map((chip) => chip.state);

      it('neither visits nor shows a station the glide passes', async () => {
        await glidingPastTheSecond();

        expect(states()[1]).not.toBe('visited');
        expect(states()[1]).not.toBe('here');
        expect(store.plate()?.title).not.toBe('zwei');
      });

      it('takes up the stations on the frame the glide arrives', async () => {
        await glidingPastTheSecond();

        engine.finishGlide();
        frame();

        expect(states()).toEqual(['visited', 'next', 'here']);
        expect(store.plate()?.title).toBe('drei');
      });

      it('takes up the stations on the frame a glide is cancelled, where the player stands', async () => {
        await glidingPastTheSecond();

        engine.cancelGlide();
        frame();

        expect(states()).toEqual(['visited', 'here', 'next']);
        expect(store.plate()?.title).toBe('zwei');
      });

      it('takes up the stations on the frame after a reduced-motion jump', async () => {
        engine.teleportGlides = true;
        dressNovaverta();
        await director.show('novaverta');
        standAt(0, -10);

        director.glideTo(3);
        expect(engine.gliding()).toBe(false);
        frame();

        expect(states()).toEqual(['visited', 'next', 'here']);
        expect(store.plate()?.title).toBe('drei');
      });
    });

    it('plays the moment over the overview and shows the banner until it ends', async () => {
      dressNovaverta();
      await director.show('novaverta');

      director.playMoment('Deslopify installiert');

      expect(engine.shots.map((shot) => shot.kind)).toEqual(['arrival', 'moment']);
      expect(engine.shots[1].pose).toBe(OVERVIEW);
      expect(store.banner()).toBe('Deslopify installiert');
      expect(store.shot()).toBe('moment');

      engine.endShot();

      expect(store.banner()).toBeNull();
      expect(store.shot()).toBeNull();
    });

    it('holds the banner up for the moment’s length in a world without an overview', async () => {
      vi.useFakeTimers();
      await director.show('novaverta');

      director.playMoment('Banner');

      expect(store.banner()).toBe('Banner');
      vi.advanceTimersByTime(MOMENT.total * 1000);
      expect(store.banner()).toBeNull();
    });

    it('clears a toast 2.2 s after the last one', async () => {
      vi.useFakeTimers();
      await director.show('novaverta');

      director.showToast('eins');
      vi.advanceTimersByTime(1000);
      director.showToast('zwei');
      vi.advanceTimersByTime(2199);
      expect(store.toast()?.text).toBe('zwei');

      vi.advanceTimersByTime(1);
      expect(store.toast()).toBeNull();
    });

    it("wires the world's toast and moment callbacks to the HUD", async () => {
      vi.useFakeTimers();
      await director.show('deslopify');
      const { sceneOptions } = engine.world as unknown as { sceneOptions: ProjectSceneOptions };

      sceneOptions.onToast?.('Laterne');
      sceneOptions.onMoment?.('Banner');

      expect(store.toast()?.text).toBe('Laterne');
      expect(store.banner()).toBe('Banner');
      // Deslopify frames its bowl: the moment's shot rises to its overview and holds the banner.
      expect(engine.shots.at(-1)?.kind).toBe('moment');
      engine.endShot();
      expect(store.banner()).toBeNull();
    });

    /** A world mid-moment, with a toast up, a station visited and the player at the next one. */
    async function midMoment(): Promise<void> {
      dressNovaverta();
      await director.show('novaverta');
      standAt(0, -10);
      standAt(0, -20);
      director.glideTo(3);
      director.showToast('Laterne');
      director.playMoment('Banner');
    }

    function expectCleared(): void {
      expect(store.banner()).toBeNull();
      expect(store.toast()).toBeNull();
      expect(store.plate()).toBeNull();
      expect(store.pitch()).toBeNull();
      expect(store.shot()).toBeNull();
      expect(engine.gliding()).toBe(false);
    }

    it('ends the shot and the glide and forgets the visits on restart', async () => {
      await midMoment();
      const endShot = vi.spyOn(engine, 'endShot');
      const cancelGlide = vi.spyOn(engine, 'cancelGlide');

      director.restart();

      expect(endShot).toHaveBeenCalled();
      expect(cancelGlide).toHaveBeenCalled();
      expectCleared();
      expect(store.stations().map((chip) => chip.state)).toEqual(['next', 'open', 'open']);
      // Restarting never plays the arrival again.
      expect(engine.shots.map((shot) => shot.kind)).toEqual(['arrival', 'moment']);
    });

    it('ends the shot and the glide and clears the HUD when the world is swapped', async () => {
      await midMoment();
      const endShot = vi.spyOn(engine, 'endShot');
      const cancelGlide = vi.spyOn(engine, 'cancelGlide');

      await director.show('poetzscher');

      expect(endShot).toHaveBeenCalled();
      expect(cancelGlide).toHaveBeenCalled();
      expectCleared();
      expect(store.stations()).toEqual([]);
    });

    it('starts a revisited world with nothing visited', async () => {
      await midMoment();
      await director.show(null);

      await director.show('novaverta');

      expect(store.stations().map((chip) => chip.state)).toEqual(['next', 'open', 'open']);
    });

    it('lets go of everything when the page goes away', async () => {
      vi.useFakeTimers();
      await midMoment();

      director.reset();

      expectCleared();
      expect(store.stations()).toEqual([]);
      expect(engine.tickables.size).toBe(0);
      // A toast timer left behind must not reach into the next page's store.
      store.showToast('neu');
      vi.advanceTimersByTime(3000);
      expect(store.toast()?.text).toBe('neu');
    });
  });

  /** A demo that takes the controls, standing in the generic scene's `demo`. */
  function capturedDemo(): InWorldDemo & { enters: number; interacts: number; exits: number } {
    const demo = {
      demoHint: 'E: umschalten · Esc: verlassen',
      enters: 0,
      interacts: 0,
      exits: 0,
      enter: () => void demo.enters++,
      interact: () => void demo.interacts++,
      exit: () => void demo.exits++,
    };
    vi.spyOn(ProjectScene.prototype, 'demo', 'get').mockReturnValue(demo);
    return demo;
  }

  it('ends a running demo before the incoming scene replaces it', async () => {
    const demo = capturedDemo();
    await director.show('novaverta');

    director.startDemo();
    expect(store.demoActive()).toBe(true);
    expect(store.demoHint()).toBe(demo.demoHint);

    await director.show('poetzscher');

    // `endDemo` must run before `setScene`, so a demo can never survive into the incoming scene.
    expect(demo.exits).toBe(1);
    expect(store.demoActive()).toBe(false);
  });

  it('lets the interact key through to the world when no demo is running', async () => {
    await director.show('novaverta');

    // No demo was ever started, so the key must reach whatever the player is standing in front
    // of — a director that swallowed it here would silently break interacting with the world.
    expect(director.demoInteract()).toBe(false);
  });

  it('consumes the interact key for a running demo instead of the world behind it', async () => {
    const demo = capturedDemo();
    await director.show('novaverta');
    director.startDemo();

    const consumed = director.demoInteract();

    // A director that failed to consume the key here would let it also trigger the landmark
    // behind the demo; one that consumed it without calling `interact()` would leave the demo
    // stuck on whatever it was showing.
    expect(demo.interacts).toBe(1);
    expect(consumed).toBe(true);
  });

  it('starts a world-mode demo without taking the controls or the interact key', async () => {
    await director.show('deslopify');
    const scene = engine.world as ProjectScene;
    const demo = scene.demo!;
    expect(demo.mode).toBe('world');
    const enter = vi.spyOn(demo, 'enter');

    director.startDemo();

    expect(enter).toHaveBeenCalledWith(engine.player);
    expect(store.demoActive()).toBe(false);
    expect(store.inputMode()).not.toBe('demo');
    expect(director.demoInteract()).toBe(false);
  });

  it('passes the world’s state line to the HUD and clears it when the world changes', async () => {
    await director.show('deslopify');
    // The stub engine never starts a world; the real one inits it in `setScene`.
    engine.world!.init(stubContext());
    expect(store.worldStatus()).toBe('Deslopify noch nicht · Entslopt 0/8');

    await director.show('novaverta');
    expect(store.worldStatus()).toBeNull();
  });

  it('drops an in-flight build on reset, so it never reaches the engine', async () => {
    const pending = director.show('novaverta');

    director.reset();
    await pending;

    expect(engine.world).toBeNull();
    expect(engine.scenesSet).toBe(0);
    expect(store.swapping()).toBe(false);
  });

  it('teleports to a landmark, facing it, when fast-travelling inside the start world', async () => {
    await director.show(null);
    const hub = engine.world as HubScene;
    const landmark = hub.landmarkFor('novaverta')!;

    director.travelTo('novaverta');

    expect(engine.player.position.x).toBeCloseTo(landmark.spawn.x, 5);
    expect(engine.player.position.z).toBeCloseTo(landmark.spawn.z, 5);
    // `rotationY`, not `spawnYaw`: fast travel faces the landmark, unlike arriving through it.
    expect(engine.player.yaw).toBeCloseTo(landmark.rotationY, 5);
  });

  it('navigates instead of teleporting when fast-travelling from a repo world', async () => {
    await director.show('novaverta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    director.travelTo('poetzscher');

    // There is nothing in a repo world to teleport to, so the router builds the destination.
    expect(navigate).toHaveBeenCalledWith(['/p', 'poetzscher']);
  });

  it('places a browser test visitor in front of a named interactable', async () => {
    await director.show('deslopify');
    const scene = engine.world as ProjectScene;

    expect(director.teleportToInteractableForTest(`${scene.id}:seed-lever:pull`)).toBe(true);
    // Deslopify stands in the jungle, whose own `toyLayout()` still lays out a lever.
    expect(scene.seedLever).not.toBeNull();
    expect(engine.player.position.x).toBeCloseTo(scene.seedLever!.position.x, 6);
    expect(engine.player.position.z).toBeCloseTo(scene.seedLever!.position.z + 1.5, 6);
    expect(engine.player.yaw).toBe(0);
  });

  it('places a browser test visitor on a spot the world names for tests', async () => {
    await director.show('deslopify');
    const spot = engine.world!.testSpots!['deslopify:bridge-south'];

    expect(director.teleportToInteractableForTest('deslopify:bridge-south')).toBe(true);
    expect(engine.player.position.x).toBeCloseTo(spot.x, 6);
    expect(engine.player.position.y).toBeCloseTo(spot.y + PLAYER_EYE_HEIGHT, 6);
    expect(engine.player.position.z).toBeCloseTo(spot.z, 6);
    expect(engine.player.yaw).toBe(spot.yaw);
  });

  it('opens the current project panel instead of navigating to the same world', async () => {
    await director.show('novaverta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    director.travelTo('novaverta');

    expect(navigate).toHaveBeenCalledWith(['/p', 'novaverta', 'info']);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ENGINE } from '@engine/engine.service';
import { DEVICE_CAPABILITIES } from '@engine/capability.service';
import { CAPABLE } from '@engine/testing/world-context';
import { StubEngine } from '@engine/testing/stub-engine';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from '@ui/store/world.store';
import { HubScene } from '@world/hub/hub.scene';
import { ProjectScene } from '@world/project/project.scene';
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

  it('builds once when two navigations overlap, and disposes the old world once', async () => {
    await director.show(null);
    const first = engine.world!;
    // Counted by hand rather than with `vi.spyOn`: the Angular vitest builder does not expose `vi`
    // as a global here, and the existing specs never reach for it.
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

  it('ends a running demo before the incoming scene replaces it', async () => {
    await director.show('deslopify');
    const scene = engine.world as ProjectScene;
    const demo = scene.demo!;
    let exits = 0;
    const exit = demo.exit.bind(demo);
    demo.exit = () => {
      exits++;
      exit();
    };

    director.startDemo();
    expect(store.demoActive()).toBe(true);

    await director.show('novaverta');

    // `endDemo` must run before `setScene`, so a demo can never survive into the incoming scene.
    expect(exits).toBe(1);
    expect(store.demoActive()).toBe(false);
  });

  it('lets the interact key through to the world when no demo is running', async () => {
    await director.show('novaverta');

    // No demo was ever started, so the key must reach whatever the player is standing in front
    // of — a director that swallowed it here would silently break interacting with the world.
    expect(director.demoInteract()).toBe(false);
  });

  it('consumes the interact key for a running demo instead of the world behind it', async () => {
    await director.show('deslopify');
    const scene = engine.world as ProjectScene;
    const demo = scene.demo!;
    let interacts = 0;
    const interact = demo.interact.bind(demo);
    demo.interact = () => {
      interacts++;
      interact();
    };
    director.startDemo();

    const consumed = director.demoInteract();

    // A director that failed to consume the key here would let it also trigger the landmark
    // behind the demo; one that consumed it without calling `interact()` would leave the demo
    // stuck on whatever it was showing.
    expect(interacts).toBe(1);
    expect(consumed).toBe(true);
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
});

import { TestBed } from '@angular/core/testing';
import { Interactable } from '@engine/interaction/interactable';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from './world.store';

const PORTAL: Interactable = {
  id: 'portal',
  // The store never reads the position, and ui tests must not pull in Three (§1).
  position: { x: 0, y: 0, z: 0 } as Interactable['position'],
  radius: 3,
  prompt: 'Deslopify betreten',
  onInteract: () => undefined,
};

describe('WorldStore', () => {
  let store: WorldStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CONTENT_SOURCE,
          useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
        },
      ],
    });
    store = TestBed.inject(WorldStore);
  });

  it('starts out booting and not ready', () => {
    expect(store.phase()).toBe('booting');
    expect(store.ready()).toBe(false);
  });

  it('moves to loading with a total to count towards', () => {
    store.beginLoading(12, 'terrain');

    expect(store.phase()).toBe('loading');
    expect(store.loadProgress()).toEqual({ loaded: 0, total: 12, label: 'terrain' });
  });

  it('tracks progress while loading', () => {
    store.beginLoading(4, 'terrain');
    store.reportProgress(3, 'sky');

    expect(store.loadProgress()).toEqual({ loaded: 3, total: 4, label: 'sky' });
  });

  it('becomes ready once the world is built', () => {
    store.beginLoading(1, 'terrain');
    store.markReady();

    expect(store.phase()).toBe('ready');
    expect(store.ready()).toBe(true);
  });

  it('records why it failed', () => {
    store.fail('WebGL context lost');

    expect(store.phase()).toBe('error');
    expect(store.errorMessage()).toBe('WebGL context lost');
    expect(store.ready()).toBe(false);
  });

  it('remembers what the player can interact with', () => {
    store.setNearby(PORTAL);
    expect(store.nearby()).toBe(PORTAL);

    store.setNearby(null);
    expect(store.nearby()).toBeNull();
  });

  describe('input mode', () => {
    beforeEach(() => store.markStarted());

    it('is the ui until the visitor has clicked through the start gate', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: CONTENT_SOURCE,
            useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
          },
        ],
      });
      expect(TestBed.inject(WorldStore).inputMode()).toBe('ui');
    });

    it('is the world while nothing is open', () => {
      expect(store.inputMode()).toBe('world');
    });

    it('is the ui while the panel is open over the world', () => {
      store.setPanelOpen(true);

      expect(store.inputMode()).toBe('ui');
    });

    it('is the ui while the contact dialog is open over the world', () => {
      store.setContactOpen(true);

      expect(store.inputMode()).toBe('ui');
    });

    it('is the ui while the menu is open', () => {
      store.toggleMenu();

      expect(store.inputMode()).toBe('ui');
    });

    it('is the ui while the settings are open', () => {
      store.setSettingsOpen(true);

      expect(store.inputMode()).toBe('ui');
    });

    it('is the demo while an in-world demo has taken over', () => {
      store.setDemoActive(true);

      expect(store.inputMode()).toBe('demo');
    });

    it('is captured while an interactable owns the controls', () => {
      store.setCaptured(true, 'Aufstehen');

      expect(store.inputMode()).toBe('captured');
      expect(store.capturePrompt()).toBe('Aufstehen');

      store.setCaptured(false);
      expect(store.inputMode()).toBe('world');
      expect(store.capturePrompt()).toBeNull();
    });

    it('lets an overlay win over a running demo', () => {
      store.setDemoActive(true);
      store.toggleMenu();

      expect(store.inputMode()).toBe('ui');
    });
  });

  describe('in-world demos', () => {
    it('carries a request from the panel to the page', () => {
      store.requestDemo('deslopify');
      expect(store.demoRequest()).toBe('deslopify');

      store.requestDemo(null);
      expect(store.demoRequest()).toBeNull();
    });

    it('remembers the hint of the running demo', () => {
      store.setDemoActive(true, 'E: Original anzeigen');
      expect(store.demoHint()).toBe('E: Original anzeigen');

      store.setDemoActive(false);
      expect(store.demoHint()).toBeNull();
    });
  });

  it('forgets every transient overlay state when the hub page goes away', async () => {
    await TestBed.inject(ContentService).ready;
    store.markReady();
    store.markStarted();
    store.setMenuOpen(true);
    store.setSettingsOpen(true);
    store.setDemoActive(true, 'hint');
    store.setCaptured(true, 'Aufstehen');
    store.requestDemo('deslopify');
    store.setNearby(PORTAL);
    store.setArea('Deslopify');
    store.setWorldStatus('Deslopify an · Entslopt 8/8');

    store.resetTransient();

    expect(store.menuOpen()).toBe(false);
    expect(store.settingsOpen()).toBe(false);
    expect(store.demoActive()).toBe(false);
    expect(store.demoHint()).toBeNull();
    expect(store.inputMode()).toBe('world');
    expect(store.capturePrompt()).toBeNull();
    expect(store.demoRequest()).toBeNull();
    expect(store.nearby()).toBeNull();
    expect(store.area()).toBe('');
    expect(store.worldStatus()).toBeNull();
    // Not transient: the visitor has already been through the gate this session.
    expect(store.started()).toBe(true);
  });

  it('opens and closes the menu explicitly', () => {
    store.setMenuOpen(true);
    expect(store.menuOpen()).toBe(true);

    store.setMenuOpen(false);
    expect(store.menuOpen()).toBe(false);
  });

  it('remembers the current project and hub travel distances', () => {
    const distances = new Map([
      ['deslopify', 18.4],
      ['novaverta', 27.1],
    ]);

    store.setCurrentProject('novaverta');
    store.setTravelDistances(distances);

    expect(store.currentProject()).toBe('novaverta');
    expect(store.travelDistances()).toBe(distances);
  });

  it('clears travel state with transient world state', () => {
    store.setCurrentProject('novaverta');
    store.setTravelDistances(new Map([['novaverta', 27.1]]));

    store.resetTransient();

    expect(store.currentProject()).toBeNull();
    expect(store.travelDistances().size).toBe(0);
  });

  it('holds the current world’s state line until it is cleared', () => {
    expect(store.worldStatus()).toBeNull();

    store.setWorldStatus('Deslopify noch nicht · Entslopt 0/8');
    expect(store.worldStatus()).toBe('Deslopify noch nicht · Entslopt 0/8');

    store.setWorldStatus(null);
    expect(store.worldStatus()).toBeNull();
  });

  it('names the area the player is standing in', () => {
    store.setArea('Clearing');

    expect(store.area()).toBe('Clearing');
  });

  describe('pausing', () => {
    it('runs while nothing is in the way', () => {
      store.markReady();

      expect(store.paused()).toBe(false);
    });

    it('pauses while the menu is open', () => {
      store.toggleMenu();

      expect(store.menuOpen()).toBe(true);
      expect(store.paused()).toBe(true);
    });

    it('pauses while the settings dialog is open', () => {
      store.setSettingsOpen(true);

      expect(store.paused()).toBe(true);
    });

    it('resumes once everything is closed again', () => {
      store.toggleMenu();
      store.toggleMenu();

      expect(store.paused()).toBe(false);
    });
  });

  it('pauses the render loop while a scene is being built', () => {
    store.setSwapping(true);

    expect(store.paused()).toBe(true);
  });

  it('forgets the panel and the swap when the page goes away', () => {
    store.setPanelOpen(true);
    store.setSwapping(true);

    store.resetTransient();

    expect(store.panelOpen()).toBe(false);
    expect(store.swapping()).toBe(false);
  });
});

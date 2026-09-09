import { TestBed } from '@angular/core/testing';
import { ContentService } from '@content/content.service';
import { WorldStore } from './world.store';

describe('WorldStore', () => {
  let store: WorldStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
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

  describe('the open destination', () => {
    it('has none to begin with', () => {
      expect(store.activeSlug()).toBeNull();
      expect(store.activeProject()).toBeNull();
    });

    it('resolves an opened slug to the project', async () => {
      await TestBed.inject(ContentService).ready;

      store.openProject('novaverta');

      expect(store.activeProject()?.title).toContain('Phönix');
    });

    it('keeps the slug but resolves nothing for an unknown project', async () => {
      await TestBed.inject(ContentService).ready;

      store.openProject('does-not-exist');

      expect(store.activeSlug()).toBe('does-not-exist');
      expect(store.activeProject()).toBeNull();
    });

    it('clears the destination on the way back to the hub', async () => {
      await TestBed.inject(ContentService).ready;
      store.openProject('novaverta');

      store.openProject(null);

      expect(store.activeProject()).toBeNull();
    });
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

    it('pauses while the tab is hidden', () => {
      store.setDocumentHidden(true);

      expect(store.paused()).toBe(true);
    });

    it('resumes once everything is closed again', () => {
      store.toggleMenu();
      store.toggleMenu();

      expect(store.paused()).toBe(false);
    });
  });
});

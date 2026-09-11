import { Service, computed, signal } from '@angular/core';
import type { InputMode } from '@engine/input.service';
import type { Interactable } from '@engine/interaction/interactable';

export type WorldPhase = 'booting' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly label: string;
}

/**
 * Everything about the world that is not the open destination — the router owns that
 * (IMPLEMENTATION_PLAN.md §3, §6).
 */
@Service()
export class WorldStore {
  readonly phase = signal<WorldPhase>('booting');
  readonly loadProgress = signal<LoadProgress>({ loaded: 0, total: 0, label: '' });
  readonly area = signal('');
  readonly errorMessage = signal<string | null>(null);

  readonly menuOpen = signal(false);
  readonly settingsOpen = signal(false);

  /** What the player is close to and facing; written by the engine only on change (§2). */
  readonly nearby = signal<Interactable | null>(null);

  /** An in-world demo has taken over the controls (§5), and what it tells the visitor to do. */
  readonly demoActive = signal(false);
  readonly demoHint = signal<string | null>(null);

  /** Slug of the in-world demo the panel asked for; the page fulfils and clears it. */
  readonly demoRequest = signal<string | null>(null);

  /**
   * The `/p/:slug/info` panel is showing on top of whatever world is open. The router owns this.
   *
   * Which world that is, the store deliberately does not know: nothing about the UI depends on it,
   * and `SceneDirector` reads the slug from the route itself.
   */
  readonly panelOpen = signal(false);
  /** A scene is being built; the veil covers the swap and the loop stands still behind it. */
  readonly swapping = signal(false);

  readonly ready = computed(() => this.phase() === 'ready');

  /** The visitor has clicked through the loading screen; only then does the world take input. */
  readonly started = signal(false);

  /** The app's own reasons to stop the render loop; the engine adds tab-hidden and off-screen. */
  readonly paused = computed(() => this.menuOpen() || this.settingsOpen() || this.swapping());

  /**
   * Any overlay takes the input away from the world; a running demo takes it next. Standing in a
   * repo world does not: it is a place, not a dialog, and no signal here reports being in one.
   */
  readonly inputMode = computed<InputMode>(() => {
    if (!this.started() || this.panelOpen() || this.menuOpen() || this.settingsOpen()) {
      return 'ui';
    }
    return this.demoActive() ? 'demo' : 'world';
  });

  beginLoading(total: number, label: string): void {
    this.phase.set('loading');
    this.loadProgress.set({ loaded: 0, total, label });
    this.errorMessage.set(null);
  }

  reportProgress(loaded: number, label = this.loadProgress().label): void {
    this.loadProgress.update((progress) => ({ ...progress, loaded, label }));
  }

  markReady(): void {
    this.phase.set('ready');
  }

  markStarted(): void {
    this.started.set(true);
  }

  fail(message: string): void {
    this.phase.set('error');
    this.errorMessage.set(message);
  }

  setPanelOpen(open: boolean): void {
    this.panelOpen.set(open);
  }

  setSwapping(swapping: boolean): void {
    this.swapping.set(swapping);
  }

  setArea(area: string): void {
    this.area.set(area);
  }

  setNearby(nearby: Interactable | null): void {
    this.nearby.set(nearby);
  }

  setDemoActive(active: boolean, hint: string | null = null): void {
    this.demoActive.set(active);
    this.demoHint.set(active ? hint : null);
  }

  requestDemo(slug: string | null): void {
    this.demoRequest.set(slug);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen.set(open);
  }

  /**
   * Clears everything that only makes sense while a hub page is mounted. The store is a root
   * singleton, so without this a demo or menu left open would still be "open" when the visitor
   * comes back from /projects — with nobody left to close it.
   */
  resetTransient(): void {
    this.setMenuOpen(false);
    this.setSettingsOpen(false);
    this.setDemoActive(false);
    this.requestDemo(null);
    this.setNearby(null);
    this.setArea('');
    this.setPanelOpen(false);
    this.setSwapping(false);
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen.set(open);
  }
}

import { Service, computed, inject, signal } from '@angular/core';
import type { InputMode } from '@engine/input.service';
import type { Interactable } from '@engine/interaction/interactable';
import { ContentService } from '@content/content.service';

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
  private readonly content = inject(ContentService);

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

  /** Which destination is open. The router owns this; the store only mirrors it (§3). */
  readonly activeSlug = signal<string | null>(null);
  readonly activeProject = computed(
    () => this.content.bySlug(this.activeSlug() ?? undefined) ?? null,
  );

  readonly ready = computed(() => this.phase() === 'ready');

  /** The visitor has clicked through the loading screen; only then does the world take input. */
  readonly started = signal(false);

  /** The app's own reason to stop the render loop; the engine adds tab-hidden and off-screen. */
  readonly paused = computed(() => this.menuOpen() || this.settingsOpen());

  /** Any overlay takes the input away from the world; a running demo takes it next. */
  readonly inputMode = computed<InputMode>(() => {
    if (!this.started() || this.activeSlug() !== null || this.menuOpen() || this.settingsOpen()) {
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

  openProject(slug: string | null): void {
    this.activeSlug.set(slug);
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
    this.menuOpen.set(false);
    this.settingsOpen.set(false);
    this.demoActive.set(false);
    this.demoHint.set(null);
    this.demoRequest.set(null);
    this.nearby.set(null);
    this.area.set('');
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen.set(open);
  }
}

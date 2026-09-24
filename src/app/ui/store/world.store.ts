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
 * World UI state. The router remains the source of truth for the open destination; the menu keeps
 * a small current-project marker and its latest hub distance snapshot here.
 */
@Service()
export class WorldStore {
  readonly phase = signal<WorldPhase>('booting');
  readonly loadProgress = signal<LoadProgress>({ loaded: 0, total: 0, label: '' });
  readonly area = signal('');
  readonly errorMessage = signal<string | null>(null);

  readonly menuOpen = signal(false);
  readonly settingsOpen = signal(false);
  /** Slug of the repository world the visitor currently stands in; `null` means the hub. */
  readonly currentProject = signal<string | null>(null);
  /** XZ walking distances from the hub spawn, captured when the menu opens. */
  readonly travelDistances = signal<ReadonlyMap<string, number>>(new Map());

  /** What the player is close to and facing; written by the engine only on change (§2). */
  readonly nearby = signal<Interactable | null>(null);

  /** A short line of the current world's own state, e.g. `Deslopify an · Entslopt 8/8`. */
  readonly worldStatus = signal<string | null>(null);

  /** An in-world demo has taken over the controls (§5), and what it tells the visitor to do. */
  readonly demoActive = signal(false);
  readonly demoHint = signal<string | null>(null);

  /** An interactable has captured movement and look, and the prompt for releasing it. */
  private readonly captureState = signal<{ readonly prompt: string } | null>(null);
  readonly captured = computed(() => this.captureState() !== null);
  readonly capturePrompt = computed(() => this.captureState()?.prompt ?? null);

  /** Slug of the in-world demo the panel asked for; the page fulfils and clears it. */
  readonly demoRequest = signal<string | null>(null);

  /**
   * The `/p/:slug/info` panel is showing on top of whatever world is open. The router owns this.
   *
   * The current project marker above is separate menu state; `SceneDirector` updates it after a
   * world swap, while the router still owns navigation and panel state.
   */
  readonly panelOpen = signal(false);
  /** The `/kontakt` dialog is showing on top of the start world. The router owns this too. */
  readonly contactOpen = signal(false);
  /** A scene is being built; the veil covers the swap and the loop stands still behind it. */
  readonly swapping = signal(false);

  readonly ready = computed(() => this.phase() === 'ready');

  /** The visitor has clicked through the loading screen; only then does the world take input. */
  readonly started = signal(false);

  /** The app's own reasons to stop the render loop; the engine adds tab-hidden and off-screen. */
  readonly paused = computed(() => this.menuOpen() || this.settingsOpen() || this.swapping());

  /**
   * Any overlay takes the input away from the world; a running demo takes it next. Standing in a
   * repo world does not: it is a place, not a dialog.
   */
  readonly inputMode = computed<InputMode>(() => {
    if (
      !this.started() ||
      this.panelOpen() ||
      this.contactOpen() ||
      this.menuOpen() ||
      this.settingsOpen()
    ) {
      return 'ui';
    }
    if (this.captured()) {
      return 'captured';
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

  setContactOpen(open: boolean): void {
    this.contactOpen.set(open);
  }

  setSwapping(swapping: boolean): void {
    this.swapping.set(swapping);
  }

  setArea(area: string): void {
    this.area.set(area);
  }

  setCurrentProject(slug: string | null): void {
    this.currentProject.set(slug);
  }

  setTravelDistances(distances: ReadonlyMap<string, number>): void {
    this.travelDistances.set(distances);
  }

  setNearby(nearby: Interactable | null): void {
    this.nearby.set(nearby);
  }

  setWorldStatus(status: string | null): void {
    this.worldStatus.set(status);
  }

  setDemoActive(active: boolean, hint: string | null = null): void {
    this.demoActive.set(active);
    this.demoHint.set(active ? hint : null);
  }

  setCaptured(captured: boolean, prompt: string | null = null): void {
    this.captureState.set(captured ? { prompt: prompt ?? 'Verlassen' } : null);
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
    this.setCurrentProject(null);
    this.setTravelDistances(new Map());
    this.setDemoActive(false);
    this.setCaptured(false);
    this.requestDemo(null);
    this.setNearby(null);
    this.setArea('');
    this.setWorldStatus(null);
    this.setPanelOpen(false);
    this.setContactOpen(false);
    this.setSwapping(false);
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen.set(open);
  }
}

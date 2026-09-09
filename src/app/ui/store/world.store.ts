import { Service, computed, inject, signal } from '@angular/core';
import { ContentService } from '@content/content.service';

export type WorldPhase = 'booting' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly label: string;
}

/**
 * Everything about the world that is not the open destination — the router owns that
 * (IMPLEMENTATION_PLAN.md §3, §6). `activeProject` and `nearby` join in M2 and M3.
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
  readonly documentHidden = signal(false);

  /** Which destination is open. The router owns this; the store only mirrors it (§3). */
  readonly activeSlug = signal<string | null>(null);
  readonly activeProject = computed(
    () => this.content.bySlug(this.activeSlug() ?? undefined) ?? null,
  );

  readonly ready = computed(() => this.phase() === 'ready');

  /** The render loop stops entirely while this is true. */
  readonly paused = computed(() => this.menuOpen() || this.settingsOpen() || this.documentHidden());

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

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  setSettingsOpen(open: boolean): void {
    this.settingsOpen.set(open);
  }

  setDocumentHidden(hidden: boolean): void {
    this.documentHidden.set(hidden);
  }
}

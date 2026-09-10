import { Service, inject, signal } from '@angular/core';
import { CONTENT_SOURCE } from './content-source';
import type { Project } from './project.model';

/**
 * Shown to the visitor when the portfolio could not be read at all — a missing or misconfigured
 * `content/repos.json`, a network blip on first paint. Plain German, no technical detail: nothing
 * a visitor could act on beyond trying again.
 */
const LOAD_ERROR = 'Die Projekte konnten nicht geladen werden. Bitte lade die Seite neu.';

/** Reads the portfolio from whichever `ContentSource` is configured (IMPLEMENTATION_PLAN.md §4). */
@Service()
export class ContentService {
  private readonly source = inject(CONTENT_SOURCE);
  private readonly all = signal<readonly Project[]>([]);
  private readonly isLoaded = signal(false);
  private readonly loadError = signal<string | null>(null);

  readonly projects = this.all.asReadonly();
  readonly loaded = this.isLoaded.asReadonly();
  /** A German message once the source could not be read at all; `null` otherwise. */
  readonly error = this.loadError.asReadonly();

  /**
   * Resolves once the source has answered — successfully or not. Under the old
   * `StaticContentSource` a rejection here was impossible; `GithubContentSource` does a real
   * fetch that can fail, and an uncaught rejection would hang every `await content.ready` and
   * surface only as an unhandled rejection in the console, leaving the visitor at a dead page.
   * The failure is caught here instead, so `ready` always settles and `loaded()` always ends up
   * `true` — callers read `error()` to tell "empty" from "failed".
   */
  readonly ready: Promise<void> = this.load();

  bySlug(slug: string | undefined): Project | undefined {
    return slug ? this.all().find((project) => project.slug === slug) : undefined;
  }

  private async load(): Promise<void> {
    try {
      this.all.set(await this.source.projects());
    } catch (error) {
      console.error('gitplore: could not load the portfolio', error);
      this.loadError.set(LOAD_ERROR);
    } finally {
      this.isLoaded.set(true);
    }
  }
}

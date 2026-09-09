import { Service, inject, signal } from '@angular/core';
import { CONTENT_SOURCE } from './content-source';
import type { Project } from './project.model';

/** Reads the portfolio from whichever `ContentSource` is configured (IMPLEMENTATION_PLAN.md §4). */
@Service()
export class ContentService {
  private readonly source = inject(CONTENT_SOURCE);
  private readonly all = signal<readonly Project[]>([]);
  private readonly isLoaded = signal(false);

  readonly projects = this.all.asReadonly();
  readonly loaded = this.isLoaded.asReadonly();

  /** Resolves once the source has answered, so views can tell "still loading" from "not found". */
  readonly ready: Promise<void> = this.load();

  bySlug(slug: string | undefined): Project | undefined {
    return slug ? this.all().find((project) => project.slug === slug) : undefined;
  }

  private async load(): Promise<void> {
    this.all.set(await this.source.projects());
    this.isLoaded.set(true);
  }
}

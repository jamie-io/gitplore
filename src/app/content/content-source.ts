import { InjectionToken } from '@angular/core';
import type { Project } from './project.model';
import { StaticContentSource } from './static-content.source';

/**
 * Where projects come from. `StaticContentSource` reads the curated list today; the explorer phase
 * adds a GitHub-backed source without touching anything above (IMPLEMENTATION_PLAN.md §4).
 */
export interface ContentSource {
  projects(): Promise<readonly Project[]>;
}

export const CONTENT_SOURCE = new InjectionToken<ContentSource>('CONTENT_SOURCE', {
  providedIn: 'root',
  factory: () => new StaticContentSource(),
});

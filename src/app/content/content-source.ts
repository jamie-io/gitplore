import { InjectionToken } from '@angular/core';
import { GithubContentSource } from './github-content.source';
import type { Project } from './project.model';

/**
 * Where projects come from: the synced repository list merged with `REPO_OVERRIDES`
 * (IMPLEMENTATION_PLAN.md §4).
 */
export interface ContentSource {
  projects(): Promise<readonly Project[]>;
}

export const CONTENT_SOURCE = new InjectionToken<ContentSource>('CONTENT_SOURCE', {
  providedIn: 'root',
  factory: () => new GithubContentSource(),
});

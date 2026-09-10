import { TestBed } from '@angular/core/testing';
import { CONTENT_SOURCE, ContentSource } from './content-source';
import { ContentService } from './content.service';
import { mergeRepo } from './merge-repo';
import type { Project } from './project.model';
import type { SyncedRepo } from './synced-repo';

const repo: SyncedRepo = {
  name: 'novaverta',
  description: null,
  language: 'HTML',
  topics: [],
  repoUrl: 'https://github.com/jamie-io/novaverta',
  homepage: null,
  pushedAt: '2026-01-01T00:00:00Z',
  stars: 0,
};
/** A stand-in for the merged portfolio: this spec exercises `ContentService`, not `mergeRepo`. */
const PROJECTS: readonly Project[] = [mergeRepo(repo, undefined)];

function serviceWith(source?: ContentSource): ContentService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CONTENT_SOURCE,
        useValue: source ?? { projects: () => Promise.resolve(PROJECTS) },
      },
    ],
  });
  return TestBed.inject(ContentService);
}

describe('ContentService', () => {
  it('starts empty and not yet loaded', () => {
    const content = serviceWith({ projects: () => new Promise<Project[]>(() => undefined) });

    expect(content.projects()).toEqual([]);
    expect(content.loaded()).toBe(false);
  });

  it('exposes the curated projects once the source resolves', async () => {
    const content = serviceWith();

    await content.ready;

    expect(content.projects()).toEqual(PROJECTS);
    expect(content.loaded()).toBe(true);
  });

  it('finds a project by slug', async () => {
    const content = serviceWith();
    await content.ready;

    expect(content.bySlug('novaverta')?.title).toBe(PROJECTS[0].title);
  });

  it('returns nothing for an unknown slug', async () => {
    const content = serviceWith();
    await content.ready;

    expect(content.bySlug('does-not-exist')).toBeUndefined();
  });

  it('reports loaded even when the portfolio is empty', async () => {
    const content = serviceWith({ projects: () => Promise.resolve([]) });
    await content.ready;

    expect(content.loaded()).toBe(true);
    expect(content.projects()).toEqual([]);
  });

  it('has no error once the source resolves', async () => {
    const content = serviceWith();
    await content.ready;

    expect(content.error()).toBeNull();
  });

  it('reaches a settled, non-hanging state when the source rejects, instead of an unhandled rejection', async () => {
    const content = serviceWith({ projects: () => Promise.reject(new Error('network down')) });

    // A rejecting `ready` would fail this test with an unhandled rejection instead of resolving.
    await content.ready;

    expect(content.loaded()).toBe(true);
    expect(content.projects()).toEqual([]);
    expect(content.error()).toMatch(/[a-zäöüß]/i);
    expect(content.error()).not.toContain('network down');
  });
});

import { TestBed } from '@angular/core/testing';
import { CONTENT_SOURCE, ContentSource } from './content-source';
import { ContentService } from './content.service';
import type { Project } from './project.model';
import { PROJECTS } from './projects';

function serviceWith(source?: ContentSource): ContentService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: source ? [{ provide: CONTENT_SOURCE, useValue: source }] : [],
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
});

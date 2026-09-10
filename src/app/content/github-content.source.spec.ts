import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GithubContentSource } from './github-content.source';
import type { SyncedRepo } from './synced-repo';

const repo = (name: string, over: Partial<SyncedRepo> = {}): SyncedRepo => ({
  name,
  description: null,
  language: 'HTML',
  topics: [],
  repoUrl: `https://github.com/jamie-io/${name}`,
  homepage: null,
  pushedAt: '2026-03-14T09:00:00Z',
  stars: 0,
  ...over,
});

describe('GithubContentSource', () => {
  let http: HttpTestingController;

  function source(): GithubContentSource {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);

    return TestBed.runInInjectionContext(() => new GithubContentSource());
  }

  it('reads the synced list relative to the base href, so a move of host stays a build flag', async () => {
    const projects = source().projects();

    // Relative, with no leading slash: `<base href>` resolves it.
    http.expectOne('content/repos.json').flush([repo('novaverta')]);

    expect((await projects).map((project) => project.slug)).toEqual(['novaverta']);
  });

  it('merges each repository with its override, so curated German copy wins', async () => {
    const projects = source().projects();

    http.expectOne('content/repos.json').flush([repo('poetzscher-homepage')]);

    const [project] = await projects;
    // `poetzscher-homepage` is curated in REPO_OVERRIDES: renamed slug, German title. The same
    // `mergePortfolio` call also applies the hidden filter, which is covered against fixtures in
    // `merge-portfolio.spec.ts` — production data has nothing hidden to assert on here.
    expect(project.slug).toBe('poetzscher');
    expect(project.title).toBe('Christopher Pötzsch – Objektservice');
  });
});

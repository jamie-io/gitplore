import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ContentSource } from './content-source';
import { mergeRepo } from './merge-repo';
import type { Project } from './project.model';
import { REPO_OVERRIDES } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

/**
 * Written by `npm run content:sync`. The URL is relative on purpose: it resolves against
 * `<base href>`, so moving from GitHub Pages to our own server stays a build flag.
 */
const REPOS_URL = 'content/repos.json';

/** The portfolio, built from the synced repository list and the per-repository overrides. */
export class GithubContentSource implements ContentSource {
  private readonly http = inject(HttpClient);

  async projects(): Promise<readonly Project[]> {
    const repos = await firstValueFrom(this.http.get<readonly SyncedRepo[]>(REPOS_URL));

    return repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));
  }
}

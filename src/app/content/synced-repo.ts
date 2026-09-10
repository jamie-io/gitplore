/** One repository as `scripts/sync-repos.mjs` wrote it into `public/content/repos.json`. */
export interface SyncedRepo {
  readonly name: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly topics: readonly string[];
  readonly repoUrl: string;
  readonly homepage: string | null;
  readonly pushedAt: string;
  readonly stars: number;
  /**
   * Written back by `scripts/sync-readmes.mjs` once it knows whether the repository actually
   * has a README. `mergeRepo` cannot find this out on its own, and a project must not promise a
   * document that does not exist.
   */
  readonly hasReadme?: boolean;
}

import { mergePortfolio } from './merge-repo';
import type { RepoOverride } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

const repo = (name: string, over: Partial<SyncedRepo> = {}): SyncedRepo => ({
  name,
  description: null,
  language: 'TypeScript',
  topics: [],
  repoUrl: `https://github.com/jamie-io/${name}`,
  homepage: null,
  pushedAt: '2026-03-14T09:00:00Z',
  stars: 0,
  ...over,
});

const overrides = (record: Record<string, RepoOverride>): Readonly<Record<string, RepoOverride>> =>
  record;

describe('mergePortfolio', () => {
  it('merges every repository with the override of the same name', () => {
    const projects = mergePortfolio(
      [repo('novaverta'), repo('deslopify')],
      overrides({ novaverta: { title: 'Phönix Industriedienstleistungen' } }),
    );

    expect(projects.map((project) => project.title)).toEqual([
      'Phönix Industriedienstleistungen',
      'deslopify',
    ]);
  });

  it('leaves out a repository the overrides mark hidden', () => {
    // `scripts/sync-repos.mjs` drops hidden repositories too, but only on a run that succeeds: it
    // soft-fails on a network problem, and the previously committed repos.json still lists them.
    const projects = mergePortfolio(
      [repo('novaverta'), repo('scratch')],
      overrides({ scratch: { hidden: true } }),
    );

    expect(projects.map((project) => project.slug)).toEqual(['novaverta']);
  });

  it('keeps the synced order, so the most recently pushed repository stays first', () => {
    const projects = mergePortfolio([repo('newest'), repo('older')], overrides({}));

    expect(projects.map((project) => project.slug)).toEqual(['newest', 'older']);
  });
});

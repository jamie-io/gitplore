import { existsSync, readFileSync } from 'node:fs';
import { mergeRepo } from './merge-repo';
import { REPO_OVERRIDES } from './repo-overrides';
import type { SyncedRepo } from './synced-repo';

const PUBLIC_DIR = 'public/';
const repos: readonly SyncedRepo[] = JSON.parse(
  readFileSync(`${PUBLIC_DIR}content/repos.json`, 'utf8'),
);
const projects = repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));

describe('the merged portfolio', () => {
  it('contains every synced repository', () => {
    expect(projects.length).toBe(repos.length);
    expect(projects.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every project a unique, url-safe slug', () => {
    const slugs = projects.map((project) => project.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
    }
  });

  it('describes every project with a title, summary and at least one tag', () => {
    for (const project of projects) {
      expect(project.title.length).toBeGreaterThan(0);
      expect(project.summary.length).toBeGreaterThan(10);
      expect(project.tags.length).toBeGreaterThan(0);
    }
  });

  it('points every project at a real repository url', () => {
    for (const project of projects) {
      expect(project.repoUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it('ships the README every bundled project promises', () => {
    for (const project of projects) {
      if (project.readme?.kind === 'bundled') {
        expect(existsSync(PUBLIC_DIR + project.readme.path), project.slug).toBe(true);
      }
    }
  });

  it('ships the screenshot every iframe demo promises', () => {
    for (const project of projects) {
      if (project.demo.kind === 'iframe') {
        expect(existsSync(PUBLIC_DIR + project.demo.screenshot), project.slug).toBe(true);
      }
    }
  });

  it('keeps every override pointed at a repository that still exists', () => {
    const names = new Set(repos.map((repo) => repo.name));

    for (const name of Object.keys(REPO_OVERRIDES)) {
      if (!REPO_OVERRIDES[name].hidden) {
        expect(names.has(name), `${name} is overridden but not synced`).toBe(true);
      }
    }
  });
});

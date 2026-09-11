import { existsSync } from 'node:fs';
import { mergedProjects, syncedRepos } from '../../../scripts/lib/portfolio.mjs';
import { repoSlug } from './merge-repo';
import { ENVIRONMENT_IDS } from './project.model';
import { REPO_OVERRIDES } from './repo-overrides';

const PUBLIC_DIR = 'public/';
const repos = syncedRepos();
const projects = mergedProjects();

describe('the merged portfolio', () => {
  it('contains every synced repository', () => {
    expect(projects.length).toBeGreaterThanOrEqual(3);
  });

  it('derives every project from a real repository, not fewer, not invented ones', () => {
    // Unlike a plain length check (true for any `mergeRepo`, including one returning `undefined`
    // for every entry, since `Array.prototype.map` preserves length), this fails if a repository
    // gets dropped, duplicated, or renamed to a slug nothing asked for.
    const expectedSlugs = repos
      .filter((repo) => !REPO_OVERRIDES[repo.name]?.hidden)
      .map((repo) => repoSlug(repo, REPO_OVERRIDES[repo.name]))
      .sort();
    const actualSlugs = projects.map((project) => project.slug).sort();

    expect(actualSlugs).toEqual(expectedSlugs);
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

  it('only embeds demos over https', () => {
    // An http:// demo URL is silently blocked as mixed content on the deployed https site — a
    // check worth keeping from the old projects.spec.ts schema test.
    for (const project of projects) {
      if (project.demo.kind === 'iframe') {
        expect(project.demo.url.startsWith('https://'), project.slug).toBe(true);
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

  it('sends every project to an environment the world can actually build', () => {
    for (const project of projects) {
      expect(ENVIRONMENT_IDS, project.slug).toContain(project.environment);
    }
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPO_LIMIT, selectRepos, toSyncedRepo } from './repos.mjs';

const api = (name, extra = {}) => ({
  name,
  description: null,
  language: null,
  topics: [],
  html_url: `https://github.com/jamie-io/${name}`,
  homepage: null,
  pushed_at: '2026-03-01T12:00:00Z',
  stargazers_count: 0,
  fork: false,
  archived: false,
  ...extra,
});

test('maps the fields the world needs and drops the rest', () => {
  const repo = toSyncedRepo(
    api('deslopify', {
      description: 'Restores original titles',
      language: 'JavaScript',
      topics: ['chrome-extension'],
      homepage: 'https://example.com/',
      stargazers_count: 7,
    }),
  );

  assert.deepEqual(repo, {
    name: 'deslopify',
    description: 'Restores original titles',
    language: 'JavaScript',
    topics: ['chrome-extension'],
    repoUrl: 'https://github.com/jamie-io/deslopify',
    homepage: 'https://example.com/',
    pushedAt: '2026-03-01T12:00:00Z',
    stars: 7,
  });
});

test('turns an empty description or homepage into null, never an empty string', () => {
  const repo = toSyncedRepo(api('novaverta', { description: '', homepage: '' }));

  assert.equal(repo.description, null);
  assert.equal(repo.homepage, null);
});

test('drops forks and archived repositories', () => {
  const selected = selectRepos(
    [api('keep'), api('a-fork', { fork: true }), api('old', { archived: true })],
    [],
  );

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['keep'],
  );
});

test('drops anything on the hidden list', () => {
  const selected = selectRepos([api('keep'), api('scratch')], ['scratch']);

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['keep'],
  );
});

test('keeps the order the api returned, so recent work stays first', () => {
  const selected = selectRepos([api('newest'), api('older'), api('oldest')], []);

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['newest', 'older', 'oldest'],
  );
});

test('caps the world at REPO_LIMIT entries', () => {
  const many = Array.from({ length: REPO_LIMIT + 5 }, (_, i) => api(`repo-${i}`));

  assert.equal(selectRepos(many, []).length, REPO_LIMIT);
});

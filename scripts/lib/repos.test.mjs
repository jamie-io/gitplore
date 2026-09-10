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
  // Names in non-alphabetical order: 'zeta' > 'mid' > 'alpha' alphabetically.
  // Push times also in reverse order relative to insertion: oldest first.
  // An implementation that sorts by name or by pushed_at would fail.
  const selected = selectRepos(
    [
      api('zeta', { pushed_at: '2026-01-01T12:00:00Z' }),
      api('mid', { pushed_at: '2026-02-01T12:00:00Z' }),
      api('alpha', { pushed_at: '2026-03-01T12:00:00Z' }),
    ],
    [],
  );

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['zeta', 'mid', 'alpha'],
  );
});

test('caps the world at REPO_LIMIT entries', () => {
  // Create REPO_LIMIT + 5 repos. Intersperse forks, archived, and hidden repos in the
  // first REPO_LIMIT + 5 positions so that exactly REPO_LIMIT valid ones would survive
  // the filters. If the cap applied before filtering, hidden repos would consume slots
  // and the test would wrongly pass.
  const repos = [];
  const hidden = [];
  for (let i = 0; i < REPO_LIMIT + 5; i++) {
    const name = `repo-${i}`;
    if (i === 3) {
      repos.push(api(name, { fork: true }));
    } else if (i === 8) {
      repos.push(api(name, { archived: true }));
    } else if (i === 14) {
      hidden.push(name);
      repos.push(api(name));
    } else if (i === 10) {
      repos.push(api(name, { fork: true }));
    } else if (i === 16) {
      repos.push(api(name, { archived: true }));
    } else {
      repos.push(api(name));
    }
  }

  const selected = selectRepos(repos, hidden);

  // Exactly REPO_LIMIT valid repos survive.
  assert.equal(selected.length, REPO_LIMIT);

  // The survivors are the valid repos in insertion order, not including filtered ones.
  const validNames = [];
  for (let i = 0; i < REPO_LIMIT + 5; i++) {
    const name = `repo-${i}`;
    if (![3, 8, 10, 14, 16].includes(i)) {
      validNames.push(name);
    }
  }

  assert.deepEqual(
    selected.map((repo) => repo.name),
    validNames.slice(0, REPO_LIMIT),
  );
});

test('never lets the cap drop a curated repository', () => {
  // REPO_LIMIT freshly pushed repositories, then the curated one that has not been touched in a
  // year. Without the exemption it falls off the end, `merged-projects.spec.ts` fails on an
  // override pointing at nothing, and the deploy breaks several steps from the cause.
  const repos = Array.from({ length: REPO_LIMIT }, (_, i) => api(`repo-${i}`));
  repos.push(api('novaverta', { pushed_at: '2025-01-01T12:00:00Z' }));

  const selected = selectRepos(repos, [], ['novaverta']);

  assert.ok(selected.some((repo) => repo.name === 'novaverta'));
});

test('still caps the world, dropping an uncurated repository to make room', () => {
  const repos = Array.from({ length: REPO_LIMIT }, (_, i) => api(`repo-${i}`));
  repos.push(api('novaverta', { pushed_at: '2025-01-01T12:00:00Z' }));

  const selected = selectRepos(repos, [], ['novaverta']);

  assert.equal(selected.length, REPO_LIMIT);
  // The least recently pushed uncurated repository is the one that makes way.
  assert.equal(
    selected.some((repo) => repo.name === `repo-${REPO_LIMIT - 1}`),
    false,
  );
});

test('keeps the pushed order when a curated repository is rescued', () => {
  const selected = selectRepos([api('newest'), api('curated'), api('oldest')], [], ['curated']);

  assert.deepEqual(
    selected.map((repo) => repo.name),
    ['newest', 'curated', 'oldest'],
  );
});

test('keeps every curated repository even when there are more than the cap allows', () => {
  const curated = Array.from({ length: REPO_LIMIT + 2 }, (_, i) => `curated-${i}`);
  const selected = selectRepos(
    curated.map((name) => api(name)),
    [],
    curated,
  );

  assert.equal(selected.length, REPO_LIMIT + 2);
});

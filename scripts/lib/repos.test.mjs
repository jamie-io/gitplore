import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMMIT_BUCKET_COUNT,
  buildCommitEnrichment,
  buildCommitBuckets,
  fetchCommitPages,
  fetchJson,
  indexCommittedRepos,
  REPO_LIMIT,
  selectRepos,
  toSyncedRepo,
  toSyncedReleases,
  withRepoData,
} from './repos.mjs';

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

test('maps repository metadata and enriched data without renaming API concepts', () => {
  const repo = withRepoData(
    toSyncedRepo(
      api('gitplore', {
        created_at: '2025-01-01T00:00:00Z',
        license: { spdx_id: 'MIT' },
        forks_count: 4,
        open_issues_count: 2,
        size: 128,
      }),
    ),
    {
      languages: { TypeScript: 900, HTML: 100 },
      commitBuckets: [3, 1],
      releases: [{ name: 'v1.0.0', date: '2026-03-01T00:00:00Z' }],
    },
  );

  assert.deepEqual(repo, {
    name: 'gitplore',
    description: null,
    language: null,
    topics: [],
    repoUrl: 'https://github.com/jamie-io/gitplore',
    homepage: null,
    pushedAt: '2026-03-01T12:00:00Z',
    stars: 0,
    createdAt: '2025-01-01T00:00:00Z',
    license: 'MIT',
    forks: 4,
    openIssues: 2,
    size: 128,
    languages: { TypeScript: 900, HTML: 100 },
    commitBuckets: [3, 1],
    releases: [{ name: 'v1.0.0', date: '2026-03-01T00:00:00Z' }],
  });
});

test('keeps empty enrichment shapes instead of turning them into missing fields', () => {
  const repo = withRepoData(toSyncedRepo(api('thin')), {
    languages: {},
    commitBuckets: Array(COMMIT_BUCKET_COUNT).fill(0),
    releases: [],
  });

  assert.deepEqual(repo.languages, {});
  assert.equal(repo.commitBuckets.length, COMMIT_BUCKET_COUNT);
  assert.deepEqual(repo.releases, []);
});

test('does not accept enrichment as the second toSyncedRepo argument', () => {
  const repo = toSyncedRepo(api('thin'), { languages: { TypeScript: 10 } });

  assert.equal(repo.languages, undefined);
});

test('buckets lifetime commits into 52 deterministic bins', () => {
  const buckets = buildCommitBuckets(
    [
      { commit: { author: { date: '2025-01-01T00:00:00Z' } } },
      { commit: { author: { date: '2025-07-03T00:00:00Z' } } },
      { commit: { author: { date: '2026-01-01T00:00:00Z' } } },
    ],
    '2025-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
  );

  assert.equal(buckets.length, COMMIT_BUCKET_COUNT);
  assert.equal(buckets[0], 1);
  assert.equal(buckets[26], 1);
  assert.equal(buckets[51], 1);
  assert.equal(
    buckets.reduce((sum, count) => sum + count, 0),
    3,
  );
});

test('anchors on the oldest returned commit and clamps commits outside the original window', () => {
  const buckets = buildCommitBuckets(
    [
      { commit: { author: { date: '2024-01-01T00:00:00Z' } } },
      { commit: { author: { date: '2025-01-01T00:00:00Z' } } },
      { commit: { author: { date: '2027-01-01T00:00:00Z' } } },
    ],
    '2025-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
  );

  assert.equal(buckets[0], 1);
  assert.equal(buckets[26], 1);
  assert.equal(buckets[51], 1);
  assert.equal(
    buckets.reduce((sum, count) => sum + count, 0),
    3,
  );
});

test('retains the committed first-commit anchor when the fetch is truncated', () => {
  const previous = {
    firstCommitAt: '2025-01-01T00:00:00Z',
    commitBuckets: [4],
  };
  const enrichment = buildCommitEnrichment(
    {
      commits: [
        { commit: { author: { date: '2025-01-05T00:00:00Z' } } },
        { commit: { author: { date: '2025-01-04T00:00:00Z' } } },
      ],
      truncated: true,
    },
    '2025-01-02T00:00:00Z',
    '2025-01-06T00:00:00Z',
    previous.firstCommitAt,
  );

  const merged = withRepoData({ name: 'gitplore' }, enrichment, previous);

  assert.equal(merged.firstCommitAt, previous.firstCommitAt);
});

test('records the oldest returned commit as the first-commit anchor after an untruncated fetch', () => {
  const enrichment = buildCommitEnrichment(
    {
      commits: [
        { commit: { author: { date: '2025-01-05T00:00:00Z' } } },
        { commit: { author: { date: '2025-01-03T00:00:00Z' } } },
      ],
      truncated: false,
    },
    '2025-01-02T00:00:00Z',
    '2025-01-06T00:00:00Z',
  );

  assert.equal(enrichment.firstCommitAt, '2025-01-03T00:00:00Z');
});

test('anchors the window at the minimum of created, committed-first, and returned-oldest dates', () => {
  const buckets = buildCommitBuckets(
    [
      { commit: { author: { date: '2025-01-05T00:00:00Z' } } },
      { commit: { author: { date: '2025-01-04T00:00:00Z' } } },
      { commit: { author: { date: '2025-01-03T00:00:00Z' } } },
    ],
    '2025-01-02T00:00:00Z',
    '2025-01-05T00:00:00Z',
    '2025-01-01T00:00:00Z',
  );

  assert.equal(buckets[26], 1);
});

test('returns undefined when commit data cannot produce a valid window', () => {
  assert.equal(buildCommitBuckets([], 'not-a-date', '2026-01-01T00:00:00Z'), undefined);
  assert.equal(buildCommitBuckets([], '2026-01-01T00:00:00Z', '2025-01-01T00:00:00Z'), undefined);
  assert.equal(buildCommitBuckets({}, '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), undefined);
});

test('returns a flat lifetime shape when no commits are available', () => {
  assert.deepEqual(
    buildCommitBuckets([], '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    Array(COMMIT_BUCKET_COUNT).fill(0),
  );
});

test('maps release names and published dates, including tag-only releases', () => {
  assert.deepEqual(
    toSyncedReleases([
      { name: 'First release', tag_name: 'v1', published_at: '2026-01-01T00:00:00Z' },
      { name: '', tag_name: 'v2', published_at: null, created_at: '2026-02-01T00:00:00Z' },
      { name: null, tag_name: null, published_at: null, created_at: null },
    ]),
    [
      { name: 'First release', date: '2026-01-01T00:00:00Z' },
      { name: 'v2', date: '2026-02-01T00:00:00Z' },
    ],
  );
});

test('keeps a committed field when an enrichment request has no value', () => {
  const previous = {
    languages: { TypeScript: 10 },
    commitBuckets: [4],
    releases: [{ name: 'old', date: '2025-01-01T00:00:00Z' }],
  };

  const merged = withRepoData(
    toSyncedRepo(api('thin')),
    { languages: {}, commitBuckets: undefined, releases: [] },
    previous,
  );

  assert.deepEqual(merged.languages, {});
  assert.deepEqual(merged.commitBuckets, [4]);
  assert.deepEqual(merged.releases, []);
});

test('retries accepted stats responses and forwards authorization headers', async () => {
  const statuses = [202, 202, 200];
  const seen = [];
  const result = await fetchJson('https://api.example.test/stats', {
    headers: { authorization: 'Bearer build-token' },
    sleep: async () => {},
    fetchImpl: async (_url, init) => {
      seen.push(init.headers);
      return new Response(JSON.stringify({ all: [1] }), { status: statuses.shift() });
    },
    retryOnAccepted: true,
  });

  assert.deepEqual(result, { all: [1] });
  assert.equal(seen.length, 3);
  assert.equal(seen[0].authorization, 'Bearer build-token');
});

test('fetches at most three full commit pages and stops at a short page', async () => {
  const requests = [];
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({ index })),
    Array.from({ length: 100 }, (_, index) => ({ index: index + 100 })),
    [{ index: 200 }],
  ];

  const result = await fetchCommitPages('https://api.example.test/commits', {
    fetchImpl: async (url) => {
      requests.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify(pages[page - 1]), { status: 200 });
    },
  });

  assert.equal(result.commits.length, 201);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    requests.map((url) => new URL(url).searchParams.get('page')),
    ['1', '2', '3'],
  );
});

test('caps commit history at three pages when every page is full', async () => {
  const requests = [];

  const result = await fetchCommitPages('https://api.example.test/commits', {
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response(JSON.stringify(Array(100).fill({})), { status: 200 });
    },
  });

  assert.equal(result.commits.length, 300);
  assert.equal(result.truncated, true);
  assert.equal(requests.length, 3);
});

test('indexes only valid records from committed repository data', () => {
  const oldRepo = { name: 'old', commitBuckets: [4] };

  assert.deepEqual(
    [...indexCommittedRepos([oldRepo, null, 'not-a-repo', { name: 4 }])],
    [['old', oldRepo]],
  );
  assert.equal(indexCommittedRepos({ name: 'not-an-array' }).size, 0);
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

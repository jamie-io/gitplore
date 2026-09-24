/**
 * Fetches Jamie's public repositories into public/content/repos.json.
 *
 * The build makes the list request plus the small per-repository enrichment requests. When the
 * build environment provides GITHUB_TOKEN, every request uses it as a bearer token; it is never
 * written into committed content or shipped JavaScript. The file is committed so the app reads it
 * same-origin and an offline build still works (the repo-world design record §3).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  buildCommitEnrichment,
  fetchCommitPages,
  fetchJson,
  indexCommittedRepos,
  selectRepos,
  toSyncedReleases,
  withRepoData,
} from './lib/repos.mjs';
import { curatedRepoNames, hiddenRepoNames } from '../src/app/content/repo-overrides.ts';

// gitplore is one developer's portfolio; a single hardcoded owner is deliberate, not a
// placeholder left over from a more general version of this script.
const OWNER = 'jamie-io';
// Overridable so the soft-failure path below can be exercised (e.g. against a 404) without
// editing this file or depending on GitHub actually being unreachable.
const SOURCE =
  process.env.GITHUB_REPOS_URL ??
  `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed&type=owner`;
const API_ROOT = process.env.GITHUB_API_ROOT ?? 'https://api.github.com';
const TARGET = new URL('../public/content/repos.json', import.meta.url);
const headers = { accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) {
  headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

let committed = [];
try {
  committed = JSON.parse(await readFile(TARGET, 'utf8'));
} catch {
  // A successful list response can still reconstruct the file from scratch.
}
const committedByName = indexCommittedRepos(committed);

async function enrich(repo) {
  const previous = committedByName.get(repo.name);
  const stable = withRepoData(repo, {}, previous);
  const base = `${API_ROOT}/repos/${OWNER}/${encodeURIComponent(repo.name)}`;
  const optional = async (field, request, map) => {
    try {
      const value =
        typeof request === 'function'
          ? await request()
          : await fetchJson(request, { headers, retryOnAccepted: true });
      return await map(value);
    } catch (error) {
      console.warn(`! ${repo.name.padEnd(22)} ${field} skipped: ${error.message}`);
      return undefined;
    }
  };

  const [languages, commits, releases] = await Promise.all([
    optional('languages', `${base}/languages`, (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid languages response');
      }
      return Object.fromEntries(
        Object.entries(value).filter(
          ([, bytes]) => typeof bytes === 'number' && Number.isFinite(bytes),
        ),
      );
    }),
    optional(
      'commitBuckets',
      () => fetchCommitPages(`${base}/commits`, { headers, retryOnAccepted: true }),
      (value) =>
        buildCommitEnrichment(value, repo.createdAt, repo.pushedAt, previous?.firstCommitAt),
    ),
    optional('releases', `${base}/releases?per_page=100`, toSyncedReleases),
  ]);

  return withRepoData(
    stable,
    {
      ...(languages !== undefined ? { languages } : {}),
      ...(commits !== undefined ? commits : {}),
      ...(releases !== undefined ? { releases } : {}),
    },
    previous,
  );
}

// Declared outside the try so the catch block can find and remove it if the run fails after the
// temp file was created but before it was renamed into place.
let tmpTarget;

try {
  const selected = selectRepos(
    await fetchJson(SOURCE, { headers }),
    hiddenRepoNames(),
    curatedRepoNames(),
  );
  const enriched = await Promise.all(selected.map((repo) => enrich(repo)));
  await mkdir(new URL('.', TARGET), { recursive: true });

  // repos.json is the offline build's only fallback, so a write that fails partway (ENOSPC, an
  // interrupted syscall, ...) must never leave it truncated or containing a fragment — that would
  // be silently worse than leaving the previous good copy in place. Writing to a fresh temp file
  // and rename()-ing it over the target is atomic on one filesystem: readers always see either the
  // old complete file or the new complete file, never something in between.
  tmpTarget = new URL(`repos.json.tmp-${randomUUID()}`, TARGET);
  await writeFile(tmpTarget, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');
  await rename(tmpTarget, TARGET);

  for (const repo of enriched) {
    console.log(`✓ ${repo.name.padEnd(22)} ${repo.language ?? '—'}`);
  }
  console.log(`\n${enriched.length} repositories written to ${fileURLToPath(TARGET)}`);
} catch (error) {
  // A deploy must not break because GitHub is briefly unavailable: the committed copy stands in.
  console.warn(`! repository sync skipped: ${error.message}`);
  console.warn('  keeping the committed public/content/repos.json');

  // public/ is copied wholesale into the build output and later stages `git add -A`, so a temp
  // file that survives a failed run (e.g. one that fails between the write and the rename) would
  // ship with the site or get committed by accident. `force: true` makes a missing file a no-op
  // rather than an error, and the nested try/catch below swallows anything else so a cleanup
  // problem can never hide the real failure reported above.
  if (tmpTarget) {
    try {
      await rm(tmpTarget, { force: true });
    } catch {
      // Deliberately ignored: the original error above is what must reach the caller.
    }
  }
}

/**
 * Fetches Jamie's public repositories into public/content/repos.json.
 *
 * One unauthenticated request per deploy, far inside GitHub's 60-per-hour-per-IP limit, and no
 * token — which matters, because GitHub Pages is a static host and could not hold one. The file is
 * committed so the app reads it same-origin and an offline build still works
 * (repo-design-notes/specs/2026-09-10-repo-worlds-design.md §3).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectRepos } from './lib/repos.mjs';
import { curatedRepoNames, hiddenRepoNames } from '../src/app/content/repo-overrides.ts';

// gitplore is one developer's portfolio; a single hardcoded owner is deliberate, not a
// placeholder left over from a more general version of this script.
const OWNER = 'jamie-io';
// Overridable so the soft-failure path below can be exercised (e.g. against a 404) without
// editing this file or depending on GitHub actually being unreachable.
const SOURCE =
  process.env.GITHUB_REPOS_URL ??
  `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed&type=owner`;
const TARGET = new URL('../public/content/repos.json', import.meta.url);

// Declared outside the try so the catch block can find and remove it if the run fails after the
// temp file was created but before it was renamed into place.
let tmpTarget;

try {
  const response = await fetch(SOURCE, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const selected = selectRepos(await response.json(), hiddenRepoNames(), curatedRepoNames());
  await mkdir(new URL('.', TARGET), { recursive: true });

  // repos.json is the offline build's only fallback, so a write that fails partway (ENOSPC, an
  // interrupted syscall, ...) must never leave it truncated or containing a fragment — that would
  // be silently worse than leaving the previous good copy in place. Writing to a fresh temp file
  // and rename()-ing it over the target is atomic on one filesystem: readers always see either the
  // old complete file or the new complete file, never something in between.
  tmpTarget = new URL(`repos.json.tmp-${randomUUID()}`, TARGET);
  await writeFile(tmpTarget, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');
  await rename(tmpTarget, TARGET);

  for (const repo of selected) {
    console.log(`✓ ${repo.name.padEnd(22)} ${repo.language ?? '—'}`);
  }
  console.log(`\n${selected.length} repositories written to ${fileURLToPath(TARGET)}`);
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

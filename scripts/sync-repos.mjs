/**
 * Fetches Jamie's public repositories into public/content/repos.json.
 *
 * One unauthenticated request per deploy, far inside GitHub's 60-per-hour-per-IP limit, and no
 * token — which matters, because GitHub Pages is a static host and could not hold one. The file is
 * committed so the app reads it same-origin and an offline build still works
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §3).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectRepos } from './lib/repos.mjs';
import { hiddenRepoNames } from '../src/app/content/repo-overrides.ts';

const OWNER = 'jamie-io';
// Overridable so the soft-failure path below can be exercised (e.g. against a 404) without
// editing this file or depending on GitHub actually being unreachable.
const SOURCE =
  process.env.GITHUB_REPOS_URL ??
  `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed&type=owner`;
const TARGET = new URL('../public/content/repos.json', import.meta.url);

try {
  const response = await fetch(SOURCE, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const selected = selectRepos(await response.json(), hiddenRepoNames());
  await mkdir(new URL('.', TARGET), { recursive: true });
  await writeFile(TARGET, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');

  for (const repo of selected) {
    console.log(`✓ ${repo.name.padEnd(22)} ${repo.language ?? '—'}`);
  }
  console.log(`\n${selected.length} repositories written to ${fileURLToPath(TARGET)}`);
} catch (error) {
  // A deploy must not break because GitHub is briefly unavailable: the committed copy stands in.
  console.warn(`! repository sync skipped: ${error.message}`);
  console.warn('  keeping the committed public/content/repos.json');
}

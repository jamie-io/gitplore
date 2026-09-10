/**
 * Fetches each synced repository's README into public/content/readme/<slug>.md, and writes back
 * whether it had one.
 *
 * The copies are committed: the app then reads them same-origin, which means no CORS, no GitHub
 * rate limit and no flicker while a panel opens (IMPLEMENTATION_PLAN.md §4). CI runs this before
 * building so the copies stay fresh; it is never a prebuild hook, because offline builds must work.
 *
 * A missing README is a genuine content bug only for a repository someone curated in
 * `REPO_OVERRIDES` — that person promised a README. An auto-discovered repository nobody has
 * looked at yet gets a warning, no file, and `mergeRepo` simply omits the README section: the build
 * must not break every time GitHub gains a new repository.
 *
 * `hasReadme` is derived from the committed tree after the loop, never from whether this run's
 * fetch succeeded. A 404, a timeout or a DNS blip must not clear the flag: for an auto-discovered
 * repository that path exits 0, so the deploy would go on and ship a project whose README section
 * had silently vanished, while the previous good copy still sat on disk and still got copied into
 * `dist`. The cost of this rule is the mirror case — a README genuinely deleted upstream keeps its
 * committed copy until someone notices — which is stale text rather than missing content, and
 * visible in a diff rather than invisible on the live site.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { repoSlug } from '../src/app/content/merge-repo.ts';
import { REPO_OVERRIDES } from '../src/app/content/repo-overrides.ts';
import { absolutise, ownerRepo } from './lib/readme.mjs';

const OUT_DIR = new URL('../public/content/readme/', import.meta.url);
const REPOS = new URL('../public/content/repos.json', import.meta.url);

let failures = 0;
await mkdir(OUT_DIR, { recursive: true });

const repos = JSON.parse(await readFile(REPOS, 'utf8'));

for (const repo of repos) {
  const override = REPO_OVERRIDES[repo.name];
  if (override?.hidden) {
    // Not part of the portfolio: `mergePortfolio` drops it, so fetching its README would only
    // write a file nothing reads.
    continue;
  }

  // The same slug `mergeRepo` resolves, so the file this writes is the file the panel asks for.
  const slug = repoSlug(repo, override);
  const { owner, repo: repoName } = ownerRepo(repo.repoUrl);
  const ref = 'HEAD';
  const source = `https://raw.githubusercontent.com/${owner}/${repoName}/${ref}/README.md`;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = absolutise(await response.text(), owner, repoName, ref);
    await writeFile(new URL(`${slug}.md`, OUT_DIR), markdown, 'utf8');
    console.log(`✓ ${slug.padEnd(22)} ${markdown.length} bytes  ← ${owner}/${repoName}`);
  } catch (error) {
    if (override) {
      // A curated repository promised a README; a missing one is a content bug, not weather.
      failures++;
      console.error(`✗ ${slug.padEnd(22)} ${source}\n  ${error.message}`);
    } else {
      console.warn(`! ${slug.padEnd(22)} could not be fetched; keeping whatever is committed`);
    }
  }
}

// The flag says what the committed tree holds, not what this run managed to download — see the
// header. A repository whose fetch failed keeps the file and the flag it already had.
for (const repo of repos) {
  const override = REPO_OVERRIDES[repo.name];
  if (override?.hidden) {
    continue;
  }
  repo.hasReadme = existsSync(new URL(`${repoSlug(repo, override)}.md`, OUT_DIR));
}

// The list records what was actually synced, so `mergeRepo` never promises a missing document.
// Same discipline as scripts/sync-repos.mjs and for the same reason: repos.json is the offline
// build's only fallback, so a write that fails partway through (ENOSPC, an interrupted syscall,
// ...) must never leave it truncated or corrupted while `hasReadme` claims a settled answer.
// Writing to a fresh temp file and rename()-ing it over the target is atomic on one filesystem:
// readers always see either the old complete file or the new complete file, never something in
// between.
const tmpTarget = new URL(`repos.json.tmp-${randomUUID()}`, REPOS);
try {
  await writeFile(tmpTarget, `${JSON.stringify(repos, null, 2)}\n`, 'utf8');
  await rename(tmpTarget, REPOS);
} catch (error) {
  // repos.json is the committed source of truth; unlike sync-repos.mjs's soft-fail on a fetch
  // problem, a local write failure here is not weather to shrug off — it means the hasReadme
  // flags this run discovered were lost, so the run itself must fail loudly.
  try {
    await rm(tmpTarget, { force: true });
  } catch {
    // Deliberately ignored: the write/rename error below is what must reach the caller.
  }
  console.error(`✗ could not write ${fileURLToPath(REPOS)}\n  ${error.message}`);
  process.exit(1);
}

if (failures > 0) {
  console.error(`\n${failures} README(s) could not be synced.`);
  process.exit(1);
}
console.log(`\nREADMEs written to ${fileURLToPath(OUT_DIR)}`);

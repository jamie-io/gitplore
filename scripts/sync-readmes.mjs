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
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { REPO_OVERRIDES } from '../src/app/content/repo-overrides.ts';

const OUT_DIR = new URL('../public/content/readme/', import.meta.url);
const REPOS = new URL('../public/content/repos.json', import.meta.url);

function ownerRepo(repoUrl) {
  const match = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(repoUrl);
  if (!match) {
    throw new Error(`repoUrl is not a GitHub repository: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

/** Relative links only resolve on github.com, so point them at the repository explicitly. */
function absolutise(markdown, owner, repo, ref) {
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  const blob = `https://github.com/${owner}/${repo}/blob/${ref}/`;
  const isAbsolute = (target) => /^(https?:|mailto:|data:|#)/i.test(target);
  const clean = (target) => target.replace(/^\.?\//, '');

  return markdown
    .replace(/!\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (whole, alt, target, title) =>
      isAbsolute(target) ? whole : `![${alt}](${raw}${clean(target)}${title})`,
    )
    .replace(
      /(^|[^!])\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
      (whole, lead, text, target, title) =>
        isAbsolute(target) ? whole : `${lead}[${text}](${blob}${clean(target)}${title})`,
    )
    .replace(
      /<img([^>]*?)src="(?!https?:|data:)([^"]+)"/gi,
      (_, attrs, src) => `<img${attrs}src="${raw}${clean(src)}"`,
    );
}

let failures = 0;
await mkdir(OUT_DIR, { recursive: true });

const repos = JSON.parse(await readFile(REPOS, 'utf8'));

for (const repo of repos) {
  const override = REPO_OVERRIDES[repo.name];
  const slug = override?.slug ?? repo.name.toLowerCase();
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
    repo.hasReadme = true;
    console.log(`✓ ${slug.padEnd(22)} ${markdown.length} bytes  ← ${owner}/${repoName}`);
  } catch (error) {
    repo.hasReadme = false;
    if (override) {
      // A curated repository promised a README; a missing one is a content bug, not weather.
      failures++;
      console.error(`✗ ${slug.padEnd(22)} ${source}\n  ${error.message}`);
    } else {
      console.warn(`! ${slug.padEnd(22)} no README; the panel omits the section`);
    }
  }
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

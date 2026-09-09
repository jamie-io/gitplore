/**
 * Fetches each bundled project README into public/content/readme/<slug>.md.
 *
 * The copies are committed: the app then reads them same-origin, which means no CORS, no GitHub
 * rate limit and no flicker while a panel opens (IMPLEMENTATION_PLAN.md §4). CI runs this before
 * building so the copies stay fresh; it is never a prebuild hook, because offline builds must work.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../src/app/content/projects.ts';

const OUT_DIR = new URL('../public/content/readme/', import.meta.url);

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

for (const project of PROJECTS) {
  if (project.readme.kind !== 'bundled') {
    continue;
  }

  const { owner, repo } = ownerRepo(project.repoUrl);
  const ref = 'HEAD';
  const source = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/README.md`;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = absolutise(await response.text(), owner, repo, ref);
    const target = new URL(`${project.slug}.md`, OUT_DIR);
    await writeFile(target, markdown, 'utf8');
    console.log(`✓ ${project.slug.padEnd(14)} ${markdown.length} bytes  ← ${owner}/${repo}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${project.slug.padEnd(14)} ${source}\n  ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} README(s) could not be synced.`);
  process.exit(1);
}
console.log(`\nREADMEs written to ${fileURLToPath(OUT_DIR)}`);

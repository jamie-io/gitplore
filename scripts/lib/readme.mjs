/**
 * Turning a repository's README into something that renders on gitplore's own origin.
 *
 * Split out of `scripts/sync-readmes.mjs` so both the rewriting rules and the committed copies can
 * be tested without the script's top-level `await fetch` running.
 */

export function ownerRepo(repoUrl) {
  const match = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(repoUrl);
  if (!match) {
    throw new Error(`repoUrl is not a GitHub repository: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

/** Relative links only resolve on github.com, so point them at the repository explicitly. */
export function absolutise(markdown, owner, repo, ref) {
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

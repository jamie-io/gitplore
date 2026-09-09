/**
 * Verifies that every `embeddable: true` in projects.ts is actually true.
 *
 * X-Frame-Options and CSP frame-ancestors cannot be detected from JavaScript in the browser, so the
 * only honest check is a request from CI (IMPLEMENTATION_PLAN.md §5).
 */
import { PROJECTS } from '../src/app/content/projects.ts';

function framingVerdict(headers) {
  const xfo = headers.get('x-frame-options');
  if (xfo) {
    return { blocked: true, reason: `X-Frame-Options: ${xfo}` };
  }

  const csp = headers.get('content-security-policy') ?? '';
  const ancestors = /frame-ancestors([^;]*)/i.exec(csp);
  if (ancestors) {
    const value = ancestors[1].trim();
    if (!/\*|https:(\s|$)/.test(value)) {
      return { blocked: true, reason: `CSP frame-ancestors ${value}` };
    }
  }

  return { blocked: false, reason: 'no framing restriction' };
}

let failures = 0;

for (const project of PROJECTS) {
  if (project.demo.kind !== 'iframe') {
    continue;
  }

  const { url, embeddable } = project.demo;

  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Some hosts answer HEAD with 405; fall back rather than reporting a false failure.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { redirect: 'follow' });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const verdict = framingVerdict(response.headers);
    const actuallyEmbeddable = !verdict.blocked;

    if (actuallyEmbeddable !== embeddable) {
      failures++;
      console.error(
        `✗ ${project.slug.padEnd(14)} declares embeddable: ${embeddable}, but ${url} is ` +
          `${actuallyEmbeddable ? 'embeddable' : 'blocked'} (${verdict.reason})`,
      );
    } else {
      console.log(`✓ ${project.slug.padEnd(14)} embeddable: ${embeddable} — ${verdict.reason}`);
    }
  } catch (error) {
    failures++;
    console.error(`✗ ${project.slug.padEnd(14)} ${url}\n  ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} demo url(s) do not match what projects.ts claims.`);
  process.exit(1);
}

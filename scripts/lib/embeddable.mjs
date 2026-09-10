/**
 * Whether a demo URL can be shown in an iframe, judged from its response headers.
 *
 * X-Frame-Options and CSP frame-ancestors cannot be detected from JavaScript in the browser, so the
 * only honest check is a request from CI (IMPLEMENTATION_PLAN.md §5).
 */
export function framingVerdict(headers) {
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

async function probe(url, fetchImpl) {
  let response = await fetchImpl(url, { method: 'HEAD', redirect: 'follow' });
  // Some hosts answer HEAD with 405; fall back rather than reporting a false failure.
  if (response.status === 405 || response.status === 501) {
    response = await fetchImpl(url, { redirect: 'follow' });
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response;
}

/**
 * Returns one message per project whose `embeddable` claim does not match the live headers, or
 * whose demo could not be reached at all. An empty array means the synced portfolio tells the truth.
 */
export async function mismatches(projects, fetchImpl = fetch) {
  const failures = [];

  for (const project of projects) {
    if (project.demo.kind !== 'iframe') {
      continue;
    }

    const { url, embeddable } = project.demo;
    try {
      const verdict = framingVerdict((await probe(url, fetchImpl)).headers);
      const actuallyEmbeddable = !verdict.blocked;
      if (actuallyEmbeddable !== embeddable) {
        failures.push(
          `${project.slug} declares embeddable: ${embeddable}, but ${url} is ` +
            `${actuallyEmbeddable ? 'embeddable' : 'blocked'} (${verdict.reason})`,
        );
      }
    } catch (error) {
      failures.push(`${project.slug} ${url}: ${error.message}`);
    }
  }

  return failures;
}

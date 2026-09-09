import assert from 'node:assert/strict';
import { test } from 'node:test';
import { framingVerdict, mismatches } from './embeddable.mjs';

const headers = (init) => new Headers(init);

test('no framing headers means embeddable', () => {
  assert.equal(framingVerdict(headers({})).blocked, false);
});

test('X-Frame-Options blocks embedding whatever its value', () => {
  assert.equal(framingVerdict(headers({ 'x-frame-options': 'DENY' })).blocked, true);
  assert.equal(framingVerdict(headers({ 'x-frame-options': 'SAMEORIGIN' })).blocked, true);
});

test("CSP frame-ancestors 'self' blocks embedding", () => {
  const verdict = framingVerdict(
    headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }),
  );
  assert.equal(verdict.blocked, true);
  assert.match(verdict.reason, /frame-ancestors/);
});

test('CSP frame-ancestors * or https: allows embedding', () => {
  assert.equal(
    framingVerdict(headers({ 'content-security-policy': 'frame-ancestors *' })).blocked,
    false,
  );
  assert.equal(
    framingVerdict(headers({ 'content-security-policy': 'frame-ancestors https:' })).blocked,
    false,
  );
});

test('a project that claims embeddable but is blocked is a mismatch', async () => {
  const project = { slug: 'x', demo: { kind: 'iframe', url: 'https://x.test/', embeddable: true } };
  const fetchStub = async () =>
    new Response(null, { status: 200, headers: { 'x-frame-options': 'DENY' } });

  const result = await mismatches([project], fetchStub);

  assert.equal(result.length, 1);
  assert.match(result[0], /declares embeddable: true/);
});

test('a project whose claim matches reality passes', async () => {
  const project = { slug: 'x', demo: { kind: 'iframe', url: 'https://x.test/', embeddable: true } };
  const fetchStub = async () => new Response(null, { status: 200 });

  assert.deepEqual(await mismatches([project], fetchStub), []);
});

test('a demo that cannot be reached is a failure, not a silent pass', async () => {
  const project = { slug: 'x', demo: { kind: 'iframe', url: 'https://x.test/', embeddable: true } };
  const fetchStub = async () => new Response(null, { status: 503 });

  const result = await mismatches([project], fetchStub);

  assert.equal(result.length, 1);
  assert.match(result[0], /HTTP 503/);
});

test('non-iframe demos are skipped', async () => {
  const project = { slug: 'x', demo: { kind: 'custom', mode: 'in-world' } };

  assert.deepEqual(
    await mismatches([project], () => {
      throw new Error('must not fetch');
    }),
    [],
  );
});

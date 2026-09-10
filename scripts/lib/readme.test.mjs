import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { absolutise, ownerRepo } from './readme.mjs';

const OWNER = 'jamie-io';
const REPO = 'gitplore';
const REF = 'HEAD';

test('reads owner and repository out of a GitHub url', () => {
  assert.deepEqual(ownerRepo('https://github.com/jamie-io/deslopify'), {
    owner: 'jamie-io',
    repo: 'deslopify',
  });
});

test('points a relative link at the repository, because relative only resolves on github.com', () => {
  assert.equal(
    absolutise('See [the plan](docs/PLAN.md).', OWNER, REPO, REF),
    'See [the plan](https://github.com/jamie-io/gitplore/blob/HEAD/docs/PLAN.md).',
  );
});

test('points a relative image at raw.githubusercontent, which serves the bytes', () => {
  assert.equal(
    absolutise('![shot](./docs/shot.png)', OWNER, REPO, REF),
    '![shot](https://raw.githubusercontent.com/jamie-io/gitplore/HEAD/docs/shot.png)',
  );
});

test('leaves an already absolute link alone', () => {
  const markdown = 'See [Angular](https://angular.dev) and [top](#top).';

  assert.equal(absolutise(markdown, OWNER, REPO, REF), markdown);
});

test("the bundled gitplore README is this repository's own README", () => {
  // `sync-readmes.mjs` fetches from the *pushed* commit, so running it on an unpushed branch
  // quietly replaces this file with the older text that is on GitHub. Nothing else catches that:
  // the site renders its own README to visitors, and stale is invisible from the outside.
  const source = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
  const bundled = readFileSync(
    join(process.cwd(), 'public', 'content', 'readme', 'gitplore.md'),
    'utf8',
  );

  assert.equal(
    bundled,
    absolutise(source, OWNER, REPO, REF),
    'public/content/readme/gitplore.md is out of date with README.md — re-run the sync after pushing, or copy README.md across',
  );
});

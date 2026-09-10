import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergedProjects, syncedRepos } from './portfolio.mjs';

// The merge rules themselves — including the hidden filter — are covered against fixtures in
// src/app/content/portfolio.spec.ts. What is only true here is the reading from disk.
test('reads the committed portfolio from disk', () => {
  const projects = mergedProjects();

  assert.ok(projects.length >= 3);
  assert.ok(projects.every((project) => project.slug && project.title && project.summary));
});

test('exposes the raw synced list, hidden repositories included', () => {
  assert.deepEqual(
    syncedRepos().map((repo) => typeof repo.name),
    syncedRepos().map(() => 'string'),
  );
  assert.ok(syncedRepos().length >= mergedProjects().length);
});

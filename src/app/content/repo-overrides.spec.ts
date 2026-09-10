import { REPO_OVERRIDES, hiddenRepoNames, hiddenNamesIn } from './repo-overrides';
import type { RepoOverride } from './repo-overrides';

describe('repo overrides', () => {
  it('keeps the curated projects addressable under their existing slugs', () => {
    expect(REPO_OVERRIDES['poetzscher-homepage'].slug).toBe('poetzscher');
    expect(REPO_OVERRIDES['novaverta'].slug).toBeUndefined();
    expect(REPO_OVERRIDES['deslopify'].slug).toBeUndefined();
  });

  it('writes German summaries, because GitHub has none', () => {
    expect.hasAssertions();
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.summary, `${name} needs a summary`).toBeTruthy();
      expect(override.summary!.length).toBeGreaterThan(20);
    }
  });

  it('pins a position for every curated project, so a push cannot move it', () => {
    expect.hasAssertions();
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.landmark?.position, `${name} needs a pinned position`).toBeDefined();
    }
  });

  it('filters hidden repositories from a fixture', () => {
    const fixture: Readonly<Record<string, RepoOverride>> = {
      visible1: { title: 'Visible One' },
      hidden1: { title: 'Hidden One', hidden: true },
      visible2: { title: 'Visible Two' },
      hidden2: { title: 'Hidden Two', hidden: true },
    };
    expect(hiddenNamesIn(fixture)).toEqual(['hidden1', 'hidden2']);
  });

  it('returns empty when nothing is hidden', () => {
    const fixture: Readonly<Record<string, RepoOverride>> = {
      visible1: { title: 'Visible One' },
      visible2: { title: 'Visible Two' },
    };
    expect(hiddenNamesIn(fixture)).toEqual([]);
  });

  it('lists hidden repositories from production data', () => {
    // This grows when a repository is actually marked hidden in REPO_OVERRIDES.
    expect(hiddenRepoNames()).toEqual([]);
  });
});

import { REPO_OVERRIDES, curatedRepoNames, hiddenRepoNames, hiddenNamesIn } from './repo-overrides';
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

  it('pins a position wherever it authors a rotation, which the ring would otherwise discard', () => {
    // An unpinned project takes a ring spot, and the spot carries its own rotation: a `rotationY`
    // without a `position` is silently thrown away (`HubScene`), so the two belong together.
    expect.hasAssertions();
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.landmark?.rotationY === undefined) {
        continue;
      }
      expect(
        override.landmark.position,
        `${name} authors a rotation but no position`,
      ).toBeDefined();
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

  it('names every curated repository, so the sync cap can never drop one', () => {
    expect(curatedRepoNames().sort()).toEqual(Object.keys(REPO_OVERRIDES).sort());
    expect(curatedRepoNames()).toContain('deslopify');
  });

  it('gives Deslopify the ridge and engraving theme, because the red one turned brown against amber', () => {
    expect(REPO_OVERRIDES['deslopify'].theme).toEqual({ primary: '#6b4712', accent: '#f4e6c8' });
  });

  it('writes German copy for every repository the world shows', () => {
    // gitplore and webkatalog_demoshop used to fall through to the raw repository name and, for
    // gitplore, its English GitHub description — an underscored machine name and an English
    // paragraph among four German ones.
    for (const name of ['gitplore', 'webkatalog_demoshop']) {
      expect(REPO_OVERRIDES[name]?.title, name).toBeTruthy();
      expect(REPO_OVERRIDES[name]?.summary, name).toBeTruthy();
      expect(REPO_OVERRIDES[name]?.theme, name).toBeDefined();
    }
  });
});

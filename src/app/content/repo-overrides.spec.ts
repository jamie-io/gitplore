import { REPO_OVERRIDES, hiddenRepoNames } from './repo-overrides';

describe('repo overrides', () => {
  it('keeps the curated projects addressable under their existing slugs', () => {
    expect(REPO_OVERRIDES['poetzscher-homepage'].slug).toBe('poetzscher');
    expect(REPO_OVERRIDES['novaverta'].slug).toBeUndefined();
    expect(REPO_OVERRIDES['deslopify'].slug).toBeUndefined();
  });

  it('writes German summaries, because GitHub has none', () => {
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.summary, `${name} needs a summary`).toBeTruthy();
      expect(override.summary!.length).toBeGreaterThan(20);
    }
  });

  it('pins a position for every curated project, so a push cannot move it', () => {
    for (const [name, override] of Object.entries(REPO_OVERRIDES)) {
      if (override.hidden) {
        continue;
      }
      expect(override.landmark?.position, `${name} needs a pinned position`).toBeDefined();
    }
  });

  it('lists hidden repositories by name', () => {
    expect(hiddenRepoNames()).toEqual(
      Object.entries(REPO_OVERRIDES)
        .filter(([, override]) => override.hidden)
        .map(([name]) => name),
    );
  });
});

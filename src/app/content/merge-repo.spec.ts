import { mergeRepo } from './merge-repo';
import type { SyncedRepo } from './synced-repo';

const repo = (over: Partial<SyncedRepo> = {}): SyncedRepo => ({
  name: 'webkatalog_demoshop',
  description: null,
  language: 'JavaScript',
  topics: [],
  repoUrl: 'https://github.com/jamie-io/webkatalog_demoshop',
  homepage: null,
  pushedAt: '2026-03-14T09:00:00Z',
  stars: 0,
  ...over,
});

describe('mergeRepo', () => {
  it('defaults the slug to the lowercased repository name', () => {
    expect(mergeRepo(repo({ name: 'Deslopify' }), undefined).slug).toBe('deslopify');
  });

  it('defaults the title to the repository name when the override has none', () => {
    expect(mergeRepo(repo({ name: 'webkatalog_demoshop' }), undefined).title).toBe(
      'webkatalog_demoshop',
    );
  });

  it('lets an override give the project a human-readable title', () => {
    expect(mergeRepo(repo(), { title: 'Christopher Pötzsch – Objektservice' }).title).toBe(
      'Christopher Pötzsch – Objektservice',
    );
  });

  it('lets an override rename the slug, so existing links keep working', () => {
    expect(mergeRepo(repo({ name: 'poetzscher-homepage' }), { slug: 'poetzscher' }).slug).toBe(
      'poetzscher',
    );
  });

  it('prefers the German summary over the GitHub description', () => {
    const merged = mergeRepo(repo({ description: 'A demo shop' }), {
      summary: 'Ein Demoshop als Übungsprojekt für Katalog- und Warenkorblogik.',
    });

    expect(merged.summary).toBe('Ein Demoshop als Übungsprojekt für Katalog- und Warenkorblogik.');
  });

  it('falls back to the GitHub description when there is no override', () => {
    expect(mergeRepo(repo({ description: 'A demo shop' }), undefined).summary).toBe('A demo shop');
  });

  it('falls back to language and last push when GitHub has no description either', () => {
    expect(mergeRepo(repo(), undefined).summary).toBe(
      'JavaScript · zuletzt aktualisiert im März 2026',
    );
  });

  it('says only the date when the language is unknown too', () => {
    expect(mergeRepo(repo({ language: null }), undefined).summary).toBe(
      'Zuletzt aktualisiert im März 2026',
    );
  });

  it("reads the push date in UTC, not the visitor's local timezone (start-of-month boundary)", () => {
    // Just after midnight UTC on the 1st: a reader west of UTC (e.g. US Pacific) must not see
    // this roll back to the previous month.
    expect(mergeRepo(repo({ pushedAt: '2026-03-01T00:30:00Z' }), undefined).summary).toBe(
      'JavaScript · zuletzt aktualisiert im März 2026',
    );
  });

  it("reads the push date in UTC, not the visitor's local timezone (end-of-month boundary)", () => {
    // Just before midnight UTC on the 31st: a reader east of UTC (e.g. Kiritimati, UTC+14) must
    // not see this roll forward to the next month.
    expect(mergeRepo(repo({ pushedAt: '2026-03-31T23:30:00Z' }), undefined).summary).toBe(
      'JavaScript · zuletzt aktualisiert im März 2026',
    );
  });

  it('builds tags from language and topics when none are given', () => {
    const merged = mergeRepo(repo({ topics: ['shop', 'demo'] }), undefined);

    expect(merged.tags).toEqual(['JavaScript', 'shop', 'demo']);
  });

  it('takes the tags the override declares instead of deriving them', () => {
    const merged = mergeRepo(repo({ language: 'JavaScript', topics: ['shop'] }), {
      tags: ['Static Site', 'Privacy by design'],
    });

    expect(merged.tags).toEqual(['Static Site', 'Privacy by design']);
  });

  it('promises a bundled README under the resolved slug when one was synced', () => {
    const merged = mergeRepo(repo({ name: 'poetzscher-homepage', hasReadme: true }), {
      slug: 'poetzscher',
    });

    expect(merged.readme).toEqual({ kind: 'bundled', path: 'content/readme/poetzscher.md' });
  });

  it('has no year when the override does not give one', () => {
    const merged = mergeRepo(repo(), undefined);

    expect(merged.year).toBeUndefined();
    expect('year' in merged).toBe(false);
  });

  it('takes the year the override declares', () => {
    expect(mergeRepo(repo(), { year: 2026 }).year).toBe(2026);
  });

  it('promises no README at all when the repository has none', () => {
    const withFlagFalse = mergeRepo(repo({ hasReadme: false }), undefined);
    const withFlagMissing = mergeRepo(repo(), undefined);

    // Not just `undefined`-valued: the key itself must be absent, or a naive
    // `JSON.stringify`/`in`-based consumer would see a promise that isn't kept.
    expect('readme' in withFlagFalse).toBe(false);
    expect('readme' in withFlagMissing).toBe(false);
  });

  it('leaves the landmark position absent so the scene can place it', () => {
    expect(mergeRepo(repo(), undefined).landmark.position).toBeUndefined();
    expect(mergeRepo(repo(), undefined).landmark.kind).toBe('portal');
  });

  it('keeps a pinned landmark exactly as the override wrote it', () => {
    const merged = mergeRepo(repo(), {
      landmark: { kind: 'screen', position: [26, 0, -14], rotationY: -0.7 },
    });

    expect(merged.landmark).toEqual({ kind: 'screen', position: [26, 0, -14], rotationY: -0.7 });
  });

  it('carries a custom landmark model path through from the override', () => {
    const merged = mergeRepo(repo(), {
      landmark: { kind: 'deslopify', model: 'assets/models/arch.glb' },
    });

    expect(merged.landmark.model).toBe('assets/models/arch.glb');
  });

  it('falls back to the default theme when the override does not give one', () => {
    expect(mergeRepo(repo(), undefined).theme).toEqual({ primary: '#3a4a5a', accent: '#e9edf1' });
  });

  it('takes the theme the override declares', () => {
    const theme = { primary: '#1b4f8f', accent: '#e8eef6' } as const;

    expect(mergeRepo(repo(), { theme }).theme).toEqual(theme);
  });

  it('has no demo when the override does not declare one', () => {
    expect(mergeRepo(repo(), undefined).demo).toEqual({ kind: 'none' });
  });

  it('takes the demo the override declares', () => {
    const demo = {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/novaverta/',
      embeddable: true,
      screenshot: 'assets/screens/novaverta.webp',
    } as const;

    expect(mergeRepo(repo(), { demo }).demo).toEqual(demo);
  });
});

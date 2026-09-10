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

  it('builds tags from language and topics when none are given', () => {
    const merged = mergeRepo(repo({ topics: ['shop', 'demo'] }), undefined);

    expect(merged.tags).toEqual(['JavaScript', 'shop', 'demo']);
  });

  it('promises a bundled README under the resolved slug when one was synced', () => {
    const merged = mergeRepo(repo({ name: 'poetzscher-homepage', hasReadme: true }), {
      slug: 'poetzscher',
    });

    expect(merged.readme).toEqual({ kind: 'bundled', path: 'content/readme/poetzscher.md' });
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

  it('has no demo when neither the override nor a homepage offers one', () => {
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

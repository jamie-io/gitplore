import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mergedProjects } from '../../../../scripts/lib/portfolio.mjs';
import type { Project } from '@content/project.model';
import { RepositoryData } from './repository-data';

const COMMIT_BUCKETS = Array.from({ length: 52 }, (_, index) =>
  index === 4 ? 2 : index === 51 ? 3 : 0,
);

const PROJECT: Project = {
  slug: 'example',
  title: 'Beispiel',
  summary: 'Ein Beispielprojekt für Repository-Daten.',
  tags: ['TypeScript'],
  repoUrl: 'https://github.com/example/example',
  languages: { TypeScript: 900, JavaScript: 100 },
  commitBuckets: COMMIT_BUCKETS,
  firstCommitAt: '2026-01-02T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  pushedAt: '2026-01-10T00:00:00Z',
  releases: [{ name: 'v1.0.0', date: '2026-01-04T00:00:00Z' }],
  stars: 4,
  forks: 2,
  openIssues: 1,
  license: 'MIT',
  demo: { kind: 'none' },
  landmark: { kind: 'portal' },
  environment: 'showroom',
  theme: { primary: '#123456', accent: '#abcdef' },
};

describe('RepositoryData', () => {
  let fixture: ComponentFixture<RepositoryData>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => host().textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const metric = (label: string) => {
    const definition = [...host().querySelectorAll('dt')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )?.parentElement;
    return definition?.querySelector('dd')?.textContent?.trim();
  };

  function render(project: Project): void {
    fixture = TestBed.createComponent(RepositoryData);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RepositoryData] }).compileComponents();
  });

  it('renders language shares, activity, releases and repository metrics in German', () => {
    render(PROJECT);

    expect(text()).toContain('Repositorydaten');
    expect(text()).toContain('TypeScript: 900 Bytes (90,0 %)');
    expect(text()).toContain('JavaScript: 100 Bytes (10,0 %)');
    expect(text()).toContain('5 Commits im Zeitraum vom 1. Januar 2026 bis 10. Januar 2026.');
    expect(text()).toContain(
      'Verteilt auf 2 von 52 Zeitabschnitten; stärkster Zeitabschnitt: 3 Commits.',
    );
    expect(text()).toContain('v1.0.0 · 4. Januar 2026');
    expect(metric('Sterne')).toBe('4');
    expect(metric('Forks')).toBe('2');
    expect(metric('Offene Issues')).toBe('1');
    expect(metric('Lizenz')).toBe('MIT');
    expect(metric('Erstellt')).toBe('1. Januar 2026');
  });

  it('states present empty fields once and omits absent fields', () => {
    render({
      ...PROJECT,
      languages: {},
      commitBuckets: Array(52).fill(0),
      releases: [],
      stars: 0,
      forks: undefined,
      openIssues: undefined,
      license: null,
    });

    expect(text()).toContain('Keine Sprachdaten vorhanden.');
    expect(text()).toContain('Keine Commits im erfassten Zeitraum.');
    expect(text()).not.toContain('Verteilt auf');
    expect(text()).toContain('Keine Veröffentlichungen.');
    expect(metric('Sterne')).toBe('0');
    expect(metric('Lizenz')).toBe('Keine Lizenz angegeben');
    expect(text()).not.toContain('Forks');
    expect(text()).not.toContain('Offene Issues');
  });

  it('uses the retained first-commit anchor when creation date is unavailable', () => {
    render({ ...PROJECT, createdAt: undefined });

    expect(text()).toContain(
      '5 Commits im Zeitraum vom 2. Januar 2026 bis 10. Januar 2026.',
    );
  });

  it('renders nothing when every repository-data field is absent', () => {
    render({
      ...PROJECT,
      languages: undefined,
      commitBuckets: undefined,
      releases: undefined,
      stars: undefined,
      forks: undefined,
      openIssues: undefined,
      license: undefined,
      createdAt: undefined,
    });

    expect(text()).toBe('');
  });

  it('keeps current repository empty states visible for every committed project', () => {
    const projects = mergedProjects();

    expect(projects.map((project) => project.slug)).toEqual([
      'gitplore',
      'webkatalog_demoshop',
      'novaverta',
      'poetzscher',
      'deslopify',
    ]);

    for (const project of projects) {
      render(project);

      expect(text()).toContain('Repositorydaten');
      expect(text()).toContain('Keine Veröffentlichungen.');
      expect(metric('Sterne')).toBe('0');
    }
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { ProjectDetailPage } from './project-detail.page';

describe('ProjectDetailPage', () => {
  let fixture: ComponentFixture<ProjectDetailPage>;
  let http: HttpTestingController;
  const host = () => fixture.nativeElement as HTMLElement;

  async function open(slug: string, readme = '# Titel\n\nText.') {
    fixture.componentRef.setInput('slug', slug);
    // Tick first: awaiting stability before flushing would deadlock on the pending README request.
    TestBed.tick();
    await Promise.resolve();
    http.match(() => true).forEach((request) => request.flush(readme));
    TestBed.tick();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Not `GithubContentSource`: `open()` flushes every pending HTTP request
        // indiscriminately, which would otherwise also answer the portfolio's own
        // `content/repos.json` fetch with README markdown and break JSON parsing.
        {
          provide: CONTENT_SOURCE,
          useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(ContentService).ready;
    fixture = TestBed.createComponent(ProjectDetailPage);
  });

  it('titles the page with the project', async () => {
    await open('novaverta');

    expect(host().querySelector('h1')?.textContent).toContain('Phönix');
  });

  it('renders the README', async () => {
    await open('novaverta', '# Überschrift\n\nAbsatz.');

    expect(host().querySelector('app-markdown h2')?.textContent).toContain('Überschrift');
  });

  it('omits the README section for a project that has none', async () => {
    const content = TestBed.inject(ContentService);
    const original = content.bySlug('novaverta')!;
    content.bySlug = (slug) =>
      slug === 'novaverta' ? { ...original, readme: undefined } : undefined;

    fixture.componentRef.setInput('slug', 'novaverta');
    TestBed.tick();
    await fixture.whenStable();

    expect(host().querySelector('app-markdown')).toBeNull();
    expect(host().textContent).not.toContain('README');
  });

  it('links to the demo and the source', async () => {
    await open('novaverta');

    expect(host().querySelector<HTMLAnchorElement>('a[data-role="demo"]')?.href).toBe(
      'https://jamie-io.github.io/novaverta/',
    );
    expect(host().querySelector<HTMLAnchorElement>('a[data-role="source"]')?.href).toBe(
      'https://github.com/jamie-io/novaverta',
    );
  });

  it('leads back to the project list', async () => {
    await open('novaverta');

    expect(
      host().querySelector<HTMLAnchorElement>('a[data-role="back"]')?.getAttribute('href'),
    ).toBe('/projects');
  });

  it('says so when the project does not exist', async () => {
    await open('nope');

    expect(host().textContent).toContain('nicht gefunden');
  });
});

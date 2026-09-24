import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { Component } from '@angular/core';
import { WorldStore } from '../store/world.store';
import { ProjectPanel } from './project-panel';

/**
 * A source stub, not `GithubContentSource`: these specs flush every pending HTTP request
 * indiscriminately (`http.match(() => true)`), which would otherwise also answer the portfolio's
 * own `content/repos.json` fetch with README markdown and break JSON parsing.
 */
const contentSourceProvider = {
  provide: CONTENT_SOURCE,
  useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
};

@Component({ template: '<p>Panel-Demo</p>' })
class StubPanelDemo {}

describe('ProjectPanel', () => {
  let fixture: ComponentFixture<ProjectPanel>;
  let http: HttpTestingController;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => host().textContent ?? '';

  async function open(slug: string, readme = '# Phönix\n\nEine Website.') {
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
      imports: [ProjectPanel],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        contentSourceProvider,
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(ContentService).ready;
    fixture = TestBed.createComponent(ProjectPanel);
  });

  it('is a modal dialog labelled by the project', async () => {
    await open('novaverta');
    const dialog = host().querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toContain('Phönix');
  });

  it('shows the title, summary and tags', async () => {
    await open('novaverta');

    expect(text()).toContain('Phönix Industriedienstleistungen');
    expect(text()).toContain('NOVA VERTA');
    expect(text()).toContain('JavaScript');
  });

  it('renders repository data in the world panel', async () => {
    const content = TestBed.inject(ContentService);
    const original = content.bySlug('novaverta')!;
    content.bySlug = (slug) =>
      slug === 'novaverta'
        ? {
            ...original,
            languages: { TypeScript: 100 },
            commitBuckets: Array(52).fill(0),
            releases: [],
            stars: 0,
            createdAt: '2026-01-01T00:00:00Z',
          }
        : undefined;

    await open('novaverta');

    expect(host().querySelector('app-repository-data')).not.toBeNull();
    expect(host().querySelector('app-repository-data h3#repository-data-title')).not.toBeNull();
    expect(host().querySelector('app-repository-data h2#repository-data-title')).toBeNull();
    expect(host().querySelector('app-repository-data h4#languages-title')).not.toBeNull();
    expect(host().querySelector('app-repository-data h3#languages-title')).toBeNull();
    expect(text()).not.toContain('Keine Veröffentlichungen.');
  });

  it('renders the bundled README', async () => {
    await open('novaverta', '# Überschrift\n\nAbsatz.');

    expect(host().querySelector('app-markdown h3')?.textContent).toContain('Überschrift');
  });

  it('links to the source repository', async () => {
    await open('novaverta');
    const link = host().querySelector<HTMLAnchorElement>('a[data-role="source"]');

    expect(link?.href).toBe('https://github.com/jamie-io/novaverta');
    expect(link?.rel).toContain('noopener');
  });

  it('offers the live demo in a new tab', async () => {
    await open('novaverta');
    const link = host().querySelector<HTMLAnchorElement>('a[data-role="demo"]');

    expect(link?.href).toBe('https://jamie-io.github.io/novaverta/');
    expect(link?.target).toBe('_blank');
  });

  it('shows no demo link for a project that has none to open', async () => {
    await open('deslopify');

    expect(host().querySelector('a[data-role="demo"]')).toBeNull();
  });

  it('explains itself when the slug is unknown', async () => {
    await open('does-not-exist');

    expect(text()).toContain('nicht gefunden');
    expect(host().querySelector('a[data-role="source"]')).toBeNull();
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
    expect(text()).not.toContain('README');
  });

  it('returns to the repo world, not the hub, when closed', async () => {
    await open('novaverta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    host().querySelector<HTMLButtonElement>('button[data-role="close"]')?.click();

    expect(navigate).toHaveBeenCalledWith(['/p', 'novaverta']);
  });

  it('returns to the repo world on Escape', async () => {
    await open('novaverta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    host()
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(navigate).toHaveBeenCalledWith(['/p', 'novaverta']);
  });
});

describe('ProjectPanel demos', () => {
  let fixture: ComponentFixture<ProjectPanel>;
  let http: HttpTestingController;

  const host = () => fixture.nativeElement as HTMLElement;

  async function open(slug: string) {
    fixture.componentRef.setInput('slug', slug);
    TestBed.tick();
    await Promise.resolve();
    http.match(() => true).forEach((request) => request.flush('# Readme'));
    TestBed.tick();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectPanel],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        contentSourceProvider,
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(ContentService).ready;
    fixture = TestBed.createComponent(ProjectPanel);
  });

  it('says so when the README cannot be loaded, instead of showing nothing', async () => {
    fixture.componentRef.setInput('slug', 'novaverta');
    TestBed.tick();
    await Promise.resolve();
    http
      .match(() => true)
      .forEach((request) => request.flush('gone', { status: 404, statusText: 'Not Found' }));
    TestBed.tick();
    await fixture.whenStable();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('README');
  });

  it('hosts a panel-mode demo component inside the panel', async () => {
    const content = TestBed.inject(ContentService);
    const original = content.bySlug('deslopify')!;
    content.bySlug = (slug) =>
      slug === 'deslopify'
        ? {
            ...original,
            demo: {
              kind: 'custom',
              mode: 'panel',
              panelComponent: () => Promise.resolve(StubPanelDemo),
            },
          }
        : undefined;
    await open('deslopify');
    await Promise.resolve();
    await fixture.whenStable();

    expect(host().querySelector('app-demo-panel-host')).not.toBeNull();
    expect(host().textContent).toContain('Panel-Demo');
  });

  it('embeds an iframe demo through the demo frame', async () => {
    await open('novaverta');

    expect(host().querySelector('app-demo-frame iframe')).not.toBeNull();
  });

  it('offers to try an in-world demo where it lives', async () => {
    await open('deslopify');

    expect(host().querySelector('app-demo-frame')).toBeNull();
    expect(host().textContent).toContain(
      'Die Demo ist der Weg durch den Dschungel: Laterne am Südufer nehmen, unter dem Bogen hindurch, an der Wand umschalten.',
    );
    expect(host().textContent).not.toContain('direkt neben dem Portal');
    const button = host().querySelector<HTMLButtonElement>('button[data-role="try-in-world"]');
    expect(button?.textContent).toContain('In der Welt');
  });

  it('asks the page for the demo and returns to its repo world', async () => {
    await open('deslopify');
    const router = TestBed.inject(Router);
    const navigated: string[] = [];
    router.navigate = ((commands: string[]) => {
      navigated.push(commands.join('/'));
      return Promise.resolve(true);
    }) as Router['navigate'];

    host().querySelector<HTMLButtonElement>('button[data-role="try-in-world"]')?.click();

    expect(TestBed.inject(WorldStore).demoRequest()).toBe('deslopify');
    expect(navigated).toEqual(['/p/deslopify']);
  });
});

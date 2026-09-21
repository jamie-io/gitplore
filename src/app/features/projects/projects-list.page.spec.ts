import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES as PROJECTS } from '@content/testing/project-fixtures';
import { ABOUT } from '@content/about';
import { ProjectsListPage } from './projects-list.page';

describe('ProjectsListPage', () => {
  let fixture: ComponentFixture<ProjectsListPage>;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectsListPage],
      providers: [
        provideRouter([]),
        { provide: CONTENT_SOURCE, useValue: { projects: () => Promise.resolve(PROJECTS) } },
      ],
    }).compileComponents();
    await TestBed.inject(ContentService).ready;
    fixture = TestBed.createComponent(ProjectsListPage);
    await fixture.whenStable();
  });

  it('heads the list with Jamie’s name, role, contact and CV from about.ts', () => {
    const about = host().querySelector('section.about');

    expect(about?.querySelector('h2')?.textContent).toBe(ABOUT.profile.name);
    expect(about?.textContent).toContain(ABOUT.profile.role);
    expect(about?.querySelector('a[data-role="mail"]')?.getAttribute('href')).toBe(
      `mailto:${ABOUT.profile.email}`,
    );
    expect(about?.querySelector('a[data-role="document"]')?.textContent?.trim()).toBe(
      'Lebenslauf, PDF, 144 kB',
    );
  });

  it('lists every project as a card', () => {
    expect(host().querySelectorAll('article').length).toBe(PROJECTS.length);
  });

  it('gives each card a heading, summary and tags', () => {
    const first = host().querySelector('article');

    expect(first?.querySelector('h2')?.textContent).toContain(PROJECTS[0].title);
    expect(first?.textContent).toContain('NOVA VERTA');
    expect(first?.querySelectorAll('li').length).toBe(PROJECTS[0].tags.length);
  });

  it('links each card to its detail page', () => {
    const link = host().querySelector<HTMLAnchorElement>('article a');

    expect(link?.getAttribute('href')).toBe(`/projects/${PROJECTS[0].slug}`);
  });

  it('shows the screenshot of a project that has one', () => {
    const image = host().querySelector<HTMLImageElement>('article img');

    expect(image?.getAttribute('src')).toContain('novaverta.webp');
    expect(image?.getAttribute('alt')).not.toBe('');
  });

  it('offers a way into the 3D world anyway', () => {
    const link = host().querySelector<HTMLAnchorElement>('a[data-role="force3d"]');

    expect(link?.getAttribute('href')).toBe('/?force3d=1');
  });

  it('has exactly one first-level heading', () => {
    expect(host().querySelectorAll('h1').length).toBe(1);
  });

  describe('when the portfolio could not be loaded', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ProjectsListPage],
        providers: [
          provideRouter([]),
          {
            provide: CONTENT_SOURCE,
            useValue: { projects: () => Promise.reject(new Error('offline')) },
          },
        ],
      }).compileComponents();
      await TestBed.inject(ContentService).ready;
      fixture = TestBed.createComponent(ProjectsListPage);
      await fixture.whenStable();
    });

    it('says so in German instead of showing an empty page', () => {
      // This route is the phone path and the screen-reader path, so it is the one that has to
      // degrade honestly rather than look like a portfolio with nothing in it.
      const alert = host().querySelector('[role="alert"]');

      expect(alert?.textContent).toContain('konnten nicht geladen werden');
    });

    it('shows no project cards at all', () => {
      expect(host().querySelectorAll('article').length).toBe(0);
    });
  });
});

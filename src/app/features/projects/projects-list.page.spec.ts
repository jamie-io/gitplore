import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContentService } from '@content/content.service';
import { PROJECTS } from '@content/projects';
import { ProjectsListPage } from './projects-list.page';

describe('ProjectsListPage', () => {
  let fixture: ComponentFixture<ProjectsListPage>;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectsListPage],
      providers: [provideRouter([])],
    }).compileComponents();
    await TestBed.inject(ContentService).ready;
    fixture = TestBed.createComponent(ProjectsListPage);
    await fixture.whenStable();
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
});

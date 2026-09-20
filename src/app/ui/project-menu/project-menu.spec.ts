import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONTENT_SOURCE } from '@content/content-source';
import { ContentService } from '@content/content.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { WorldStore } from '../store/world.store';
import { ProjectMenu } from './project-menu';

describe('ProjectMenu', () => {
  let fixture: ComponentFixture<ProjectMenu>;
  let store: WorldStore;

  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProjectMenu],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: CONTENT_SOURCE,
          useValue: { projects: () => Promise.resolve(PROJECT_FIXTURES) },
        },
      ],
    }).compileComponents();
    await TestBed.inject(ContentService).ready;
    store = TestBed.inject(WorldStore);
    store.setMenuOpen(true);
    fixture = TestBed.createComponent(ProjectMenu);
    await fixture.whenStable();
  });

  it('is a modal dialog with a name', () => {
    const dialog = host().querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('lists every project', () => {
    expect(host().querySelectorAll('li').length).toBe(3);
    expect(host().textContent).toContain('Deslopify');
  });

  it('offers to travel to a project and says which one', () => {
    const travelled: string[] = [];
    fixture.componentInstance.travel.subscribe((slug) => travelled.push(slug));

    host()
      .querySelector<HTMLButtonElement>('button[data-role="travel"][data-slug="deslopify"]')
      ?.click();

    expect(travelled).toEqual(['deslopify']);
  });

  it('closes itself after travelling', async () => {
    host().querySelector<HTMLButtonElement>('button[data-role="travel"]')?.click();
    await fixture.whenStable();

    expect(store.menuOpen()).toBe(false);
  });

  it('links each project to its destination', () => {
    const link = host().querySelector<HTMLAnchorElement>(
      'a[data-role="open"][data-slug="novaverta"]',
    );

    expect(link?.getAttribute('href')).toBe('/p/novaverta');
  });

  it('marks current world and opens its information panel', () => {
    store.setCurrentProject('novaverta');
    fixture.detectChanges();

    const row = host().querySelector<HTMLElement>('li[data-slug="novaverta"]');
    const travel = row?.querySelector<HTMLButtonElement>('button[data-role="travel"]');
    const open = row?.querySelector<HTMLAnchorElement>('a[data-role="open"]');

    expect(row?.getAttribute('aria-current')).toBe('location');
    expect(row?.textContent).toContain('Du bist hier');
    expect(travel?.disabled).toBe(true);
    expect(open?.getAttribute('href')).toBe('/p/novaverta/info');
  });

  it('shows walking distance when hub distances exist', () => {
    store.setTravelDistances(new Map([['novaverta', 27.1]]));
    fixture.detectChanges();

    const row = host().querySelector<HTMLElement>('li[data-slug="novaverta"]');

    expect(row?.querySelector('.distance')?.textContent?.trim()).toBe('27 m entfernt');
  });

  it('hides walking distance when no hub distances exist', () => {
    expect(host().querySelector('.distance')).toBeNull();
  });

  it('links to the simple project list and closes on the way there', async () => {
    const link = host().querySelector<HTMLAnchorElement>('a[data-role="list"]');
    expect(link?.getAttribute('href')).toBe('/projects');

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(store.menuOpen()).toBe(false);
  });

  it('closes on the close button', async () => {
    host().querySelector<HTMLButtonElement>('button[data-role="close"]')?.click();
    await fixture.whenStable();

    expect(store.menuOpen()).toBe(false);
  });

  it('closes on escape', async () => {
    host()
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(store.menuOpen()).toBe(false);
  });
});

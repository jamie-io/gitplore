import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ABOUT } from '@content/about';
import { AboutContact } from './about-contact';

describe('AboutContact', () => {
  let fixture: ComponentFixture<AboutContact>;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [AboutContact] }).compileComponents();
    fixture = TestBed.createComponent(AboutContact);
    await fixture.whenStable();
  });

  it('names Jamie and his role from about.ts', () => {
    expect(host().querySelector('h2')?.textContent).toBe(ABOUT.profile.name);
    expect(host().querySelector('.role')?.textContent).toBe(ABOUT.profile.role);
  });

  it('links the address as a mailto: link', () => {
    const mail = host().querySelector<HTMLAnchorElement>('a[data-role="mail"]');

    expect(mail?.getAttribute('href')).toBe(`mailto:${ABOUT.profile.email}`);
    expect(mail?.textContent).toContain(ABOUT.profile.email);
  });

  it('offers the CV as a download that names its format and size', () => {
    const cv = host().querySelector<HTMLAnchorElement>('a[data-role="document"]');

    expect(cv?.getAttribute('href')).toBe('docs/Lebenslauf-Jamie-Jahn.pdf');
    expect(cv?.hasAttribute('download')).toBe(true);
    expect(cv?.textContent?.trim()).toBe('Lebenslauf, PDF, 144 kB');
  });

  it('shows the summary only where asked, and labels its heading by the given id', async () => {
    expect(host().querySelector('.summary')).toBeNull();

    fixture.componentRef.setInput('showSummary', true);
    fixture.componentRef.setInput('headingId', 'contact-heading');
    await fixture.whenStable();

    expect(host().querySelector('.summary')?.textContent).toBe(ABOUT.profile.summary);
    expect(host().querySelector('h2')?.id).toBe('contact-heading');
  });
});

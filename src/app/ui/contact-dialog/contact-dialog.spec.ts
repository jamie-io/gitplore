import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ABOUT } from '@content/about';
import { ContactDialog } from './contact-dialog';

describe('ContactDialog', () => {
  let fixture: ComponentFixture<ContactDialog>;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ContactDialog],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ContactDialog);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('is a modal dialog labelled by Jamie’s name', () => {
    const dialog = host().querySelector('[role="dialog"]');
    const labelledBy = dialog?.getAttribute('aria-labelledby');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.hasAttribute('appFocusTrap')).toBe(true);
    expect(host().querySelector(`#${labelledBy}`)?.textContent).toBe(ABOUT.profile.name);
  });

  it('carries the mailto: link and the CV download', () => {
    expect(host().querySelector('a[data-role="mail"]')?.getAttribute('href')).toBe(
      `mailto:${ABOUT.profile.email}`,
    );
    expect(host().querySelector('a[data-role="document"]')?.hasAttribute('download')).toBe(true);
  });

  it('puts the focus on its first control', () => {
    expect(document.activeElement).toBe(host().querySelector('button[data-role="close"]'));
  });

  it('closes back to the start world by button and by Escape', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    host().querySelector<HTMLButtonElement>('button[data-role="close"]')?.click();
    host()
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});

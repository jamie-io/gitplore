import { AfterViewInit, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus inside an overlay and hands it back when the overlay closes
 * (IMPLEMENTATION_PLAN.md §6). Every `aria-modal` region in the app carries this.
 */
@Directive({
  selector: '[appFocusTrap]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class FocusTrapDirective implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const previous = document.activeElement as HTMLElement | null;

    inject(DestroyRef).onDestroy(() => previous?.focus?.());
  }

  ngAfterViewInit(): void {
    this.focusable()[0]?.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = this.focusable();
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    // Overlay content is added and removed by `@if`, so anything still in the DOM is really there.
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => !element.closest('[hidden]'),
    );
  }
}

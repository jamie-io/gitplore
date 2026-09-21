import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import { AboutContact } from '../about/about-contact';

/**
 * The contact dialog, opened by the `/kontakt` child route over the start world — which is what
 * the camp's obelisk navigates to. Closing it returns to the world at `/`, and the focus trap hands
 * focus back to whatever held it before.
 */
@Component({
  selector: 'app-contact-dialog',
  imports: [FocusTrapDirective, AboutContact],
  template: `
    <div class="backdrop">
      <div
        appFocusTrap
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-heading"
        (keydown.escape)="close()"
      >
        <button class="close" type="button" data-role="close" (click)="close()">Schließen</button>
        <p class="kicker">Kontakt</p>
        <app-about-contact headingId="contact-heading" [showSummary]="true" />
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: clamp(0.5rem, 3vw, 2rem);
      background: rgb(10 20 30 / 55%);
      backdrop-filter: blur(3px);
    }
    .dialog {
      position: relative;
      inline-size: min(38rem, 100%);
      max-block-size: 100%;
      overflow: auto;
      padding: clamp(1rem, 3vw, 2rem);
      border-radius: 0.9rem;
      border-block-start: 5px solid #2c3a40;
      background: #fff;
      color: #16202a;
      box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 35%);
      font-family: system-ui, sans-serif;
      line-height: 1.5;
    }
    .kicker {
      margin: 0 6rem 0.25rem 0;
      color: #4a5560;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .close {
      position: absolute;
      inset-block-start: 0.75rem;
      inset-inline-end: 0.75rem;
      padding: 0.4rem 0.9rem;
      border: 1px solid currentcolor;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
  `,
})
export class ContactDialog {
  private readonly router = inject(Router);

  protected close(): void {
    void this.router.navigate(['/']);
  }
}

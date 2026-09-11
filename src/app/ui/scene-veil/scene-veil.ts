import { Component, input } from '@angular/core';

/**
 * Covers the canvas while one world is swapped for another (spec §6).
 *
 * Deliberately *not* the `LoadingScreen`: that is a modal `aria-modal` dialog with a focus trap,
 * and trapping focus for the length of a build would strand a keyboard user mid-walk (spec §7).
 * This is a plain status region that the page renders on top of everything and nobody can tab into.
 */
@Component({
  selector: 'app-scene-veil',
  template: `
    <div class="veil" [class.visible]="visible()">
      @if (visible()) {
        <p role="status" aria-busy="true">Welt wird geladen …</p>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .veil {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: #0b141c;
      color: #fff;
      font:
        500 1rem/1.4 system-ui,
        sans-serif;
      opacity: 0;
      transition: opacity 220ms ease;
    }
    .veil.visible {
      opacity: 1;
    }
    :host(.instant) .veil {
      transition: none;
    }
    p {
      margin: 0;
    }
  `,
  host: {
    '[class.instant]': 'instant()',
  },
})
export class SceneVeil {
  /** A scene is being built. */
  readonly visible = input.required<boolean>();
  /** `prefers-reduced-motion`, or the settings override: the fade becomes a hard cut (spec §6). */
  readonly instant = input(false);
}

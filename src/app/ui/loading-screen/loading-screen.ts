import { Component, inject, output } from '@angular/core';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import { WorldStore } from '../store/world.store';

/**
 * Covers the canvas until the world is ready, then becomes the "click to start" gate that focuses
 * the world and requests pointer lock (IMPLEMENTATION_PLAN.md §6, §11).
 */
@Component({
  selector: 'app-loading-screen',
  imports: [FocusTrapDirective],
  template: `
    <div
      appFocusTrap
      class="screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
    >
      <h1 id="loading-title">Gitplore</h1>

      @switch (store.phase()) {
        @case ('error') {
          <p role="alert">Die Welt konnte nicht geladen werden: {{ store.errorMessage() }}</p>
          <a href="projects">Zur Projektliste</a>
        }
        @case ('ready') {
          <p class="hint">
            Bewegen mit <kbd>WASD</kbd>, umsehen mit der Maus oder den <kbd>Pfeiltasten</kbd>,
            benutzen mit <kbd>E</kbd>, Menü mit <kbd>M</kbd>.
          </p>
          <button type="button" data-role="start" (click)="begin()">Starten</button>
          <a href="projects">Lieber als Liste</a>
        }
        @default {
          <p>Lädt {{ store.loadProgress().label }} …</p>
          <progress [max]="store.loadProgress().total || 1" [value]="store.loadProgress().loaded">
            {{ store.loadProgress().loaded }} / {{ store.loadProgress().total }}
          </progress>
        }
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgb(10 20 30 / 78%);
      color: #fff;
      font-family: system-ui, sans-serif;
      text-align: center;
    }
    .screen {
      display: grid;
      gap: 1rem;
      justify-items: center;
      max-inline-size: 32rem;
      padding: 2rem;
    }
    h1 {
      margin: 0;
      font-size: 2.4rem;
      letter-spacing: 0.04em;
    }
    .hint {
      margin: 0;
      line-height: 1.6;
    }
    kbd {
      padding: 0.05em 0.4em;
      border: 1px solid rgb(255 255 255 / 60%);
      border-radius: 0.3em;
      font: inherit;
    }
    progress {
      inline-size: 16rem;
    }
    button {
      padding: 0.7rem 2rem;
      border: 0;
      border-radius: 999px;
      background: #fff;
      color: #16202a;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button:focus-visible,
    a:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 3px;
    }
    a {
      color: #fff;
    }
  `,
})
export class LoadingScreen {
  /** The visitor is ready: the page focuses the world and asks for pointer lock. */
  readonly start = output<void>();

  protected readonly store = inject(WorldStore);

  protected begin(): void {
    this.store.markStarted();
    this.start.emit();
  }
}

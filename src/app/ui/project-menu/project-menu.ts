import { Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '@content/content.service';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import { WorldStore } from '../store/world.store';

/**
 * Direct travel (IMPLEMENTATION_PLAN.md §6): every project can be opened at once or reached by
 * fast travel. The page owns the player, so travelling is an output; opening is a plain link.
 */
@Component({
  selector: 'app-project-menu',
  imports: [RouterLink, FocusTrapDirective],
  template: `
    <div class="backdrop">
      <div
        appFocusTrap
        class="menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
        (keydown.escape)="close()"
      >
        <h2 id="menu-title">Projekte</h2>
        <ul>
          @for (project of projects(); track project.slug) {
            <li [style.--primary]="project.theme.primary">
              <span class="title">{{ project.title }}</span>
              <span class="summary">{{ project.summary }}</span>
              <span class="actions">
                <button
                  type="button"
                  data-role="travel"
                  [attr.data-slug]="project.slug"
                  (click)="travelTo(project.slug)"
                >
                  Hinreisen
                </button>
                <a
                  data-role="open"
                  [attr.data-slug]="project.slug"
                  [routerLink]="['/p', project.slug]"
                  (click)="close()"
                >
                  Öffnen
                </a>
              </span>
            </li>
          }
        </ul>
        <footer>
          <a data-role="list" routerLink="/projects" (click)="close()">Alle Projekte als Liste</a>
          <button type="button" data-role="close" (click)="close()">
            Schließen <kbd>Esc</kbd>
          </button>
        </footer>
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
    .menu {
      inline-size: min(40rem, 100%);
      max-block-size: 100%;
      overflow: auto;
      padding: clamp(1rem, 3vw, 2rem);
      border-radius: 0.9rem;
      background: #fff;
      color: #16202a;
      box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 35%);
      font-family: system-ui, sans-serif;
    }
    h2 {
      margin: 0 0 1rem;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      gap: 0.25rem;
      padding: 0.9rem 0 0.9rem 1rem;
      border-inline-start: 5px solid var(--primary);
      border-block-end: 1px solid rgb(0 0 0 / 10%);
    }
    .title {
      font-weight: 600;
    }
    .summary {
      font-size: 0.9rem;
      color: #3c4854;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-block-start: 0.35rem;
    }
    .actions button,
    .actions a,
    footer button {
      padding: 0.4rem 0.9rem;
      border: 1px solid currentcolor;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .actions button {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
    }
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-block-start: 1.25rem;
    }
    kbd {
      font: inherit;
      font-size: 0.8em;
      opacity: 0.7;
    }
  `,
})
export class ProjectMenu {
  /** Slug of the project the visitor wants to be taken to. */
  readonly travel = output<string>();

  private readonly store = inject(WorldStore);

  protected readonly projects = inject(ContentService).projects;

  protected travelTo(slug: string): void {
    this.travel.emit(slug);
    this.close();
  }

  protected close(): void {
    this.store.setMenuOpen(false);
  }
}

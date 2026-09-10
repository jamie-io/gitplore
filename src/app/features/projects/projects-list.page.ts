import { Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '@content/content.service';

/** The simple view: the screen-reader and mobile path (IMPLEMENTATION_PLAN.md §7). */
@Component({
  selector: 'app-projects-list-page',
  imports: [RouterLink, NgOptimizedImage],
  template: `
    <main>
      <header>
        <h1>Projekte</h1>
        <p>Eine Auswahl meiner Arbeiten. Jedes Projekt hat auch ein Ziel in der 3D-Welt.</p>
        <a data-role="force3d" routerLink="/" [queryParams]="{ force3d: 1 }">
          Trotzdem die 3D-Welt öffnen
        </a>
      </header>

      @if (error(); as message) {
        <p class="load-error" role="alert">{{ message }}</p>
      }

      <ul class="cards">
        @for (project of projects(); track project.slug) {
          <li>
            <article [style.--primary]="project.theme.primary">
              @if (project.demo.kind === 'iframe') {
                <img
                  [ngSrc]="project.demo.screenshot"
                  [alt]="'Screenshot von ' + project.title"
                  width="1024"
                  height="640"
                />
              }
              <h2>
                <a [routerLink]="['/projects', project.slug]">{{ project.title }}</a>
              </h2>
              <p>{{ project.summary }}</p>
              <ul class="tags">
                @for (tag of project.tags; track tag) {
                  <li>{{ tag }}</li>
                }
              </ul>
            </article>
          </li>
        }
      </ul>
    </main>
  `,
  styles: `
    main {
      max-inline-size: 60rem;
      margin-inline: auto;
      padding: clamp(1rem, 4vw, 2.5rem);
      font-family: system-ui, sans-serif;
      line-height: 1.55;
    }
    .load-error {
      padding: 0.85rem 1rem;
      border: 1px solid rgb(143 47 47 / 35%);
      border-radius: 0.5rem;
      background: #f6eaea;
      color: #6d2323;
    }
    .cards {
      display: grid;
      gap: 1.5rem;
      margin: 2rem 0 0;
      padding: 0;
      list-style: none;
      grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    }
    article {
      block-size: 100%;
      padding-block-end: 1rem;
      border: 1px solid rgb(0 0 0 / 12%);
      border-block-start: 4px solid var(--primary);
      border-radius: 0.75rem;
      overflow: hidden;
    }
    article img {
      display: block;
      inline-size: 100%;
      block-size: auto;
      aspect-ratio: 1024 / 640;
      object-fit: cover;
    }
    article > :where(h2, p, .tags) {
      margin-inline: 1rem;
    }
    h2 {
      font-size: 1.15rem;
    }
    h2 a {
      color: var(--primary);
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
    }
    .tags li {
      padding: 0.1rem 0.55rem;
      border-radius: 999px;
      background: rgb(0 0 0 / 7%);
    }
  `,
})
export class ProjectsListPage {
  private readonly content = inject(ContentService);

  protected readonly projects = this.content.projects;
  /** German, and shown here too: `/projects` is the phone and screen-reader path (§7). */
  protected readonly error = this.content.error;
}

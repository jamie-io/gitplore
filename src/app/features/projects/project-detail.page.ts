import { Component, Injector, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '@content/content.service';
import { MarkdownComponent } from '@content/markdown/markdown.component';
import { ReadmeService } from '@content/readme.service';
import { RepositoryData } from '@ui/repository-data/repository-data';

/** Simple-view counterpart of the project panel (IMPLEMENTATION_PLAN.md §7). */
@Component({
  selector: 'app-project-detail-page',
  imports: [MarkdownComponent, RouterLink, RepositoryData],
  template: `
    <main>
      <a data-role="back" routerLink="/projects">← Alle Projekte</a>

      @if (project(); as project) {
        <h1 [style.color]="project.theme.primary">{{ project.title }}</h1>
        <p class="summary">{{ project.summary }}</p>

        <nav class="actions">
          @if (demoUrl(); as url) {
            <a data-role="demo" [href]="url" target="_blank" rel="noopener noreferrer">
              Demo öffnen
            </a>
          }
          <a data-role="source" [href]="project.repoUrl" target="_blank" rel="noopener noreferrer">
            Quellcode
          </a>
        </nav>

        <app-repository-data [project]="project" />

        @if (project.readme) {
          @if (readme.isLoading()) {
            <p role="status">README wird geladen …</p>
          } @else if (readme.error()) {
            <p role="alert">Die README konnte nicht geladen werden – der Quellcode enthält sie.</p>
          } @else if (readme.value(); as markdown) {
            <app-markdown [markdown]="markdown" />
          }
        }
      } @else if (error(); as message) {
        <!-- The project may well exist; what failed is the fetch, so do not claim otherwise. -->
        <h1>Projekte nicht verfügbar</h1>
        <p class="load-error" role="alert">{{ message }}</p>
      } @else if (contentReady()) {
        <h1>Projekt nicht gefunden</h1>
        <p>Für „{{ slug() }}“ gibt es keinen Eintrag.</p>
      }
    </main>
  `,
  styles: `
    main {
      max-inline-size: 48rem;
      margin-inline: auto;
      padding: clamp(1rem, 4vw, 2.5rem);
      font-family: system-ui, sans-serif;
      line-height: 1.6;
    }
    .summary {
      max-inline-size: 60ch;
      font-size: 1.05rem;
    }
    .load-error {
      padding: 0.85rem 1rem;
      border: 1px solid rgb(143 47 47 / 35%);
      border-radius: 0.5rem;
      background: #f6eaea;
      color: #6d2323;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-block: 1.25rem 2rem;
    }
    .actions a {
      padding: 0.5rem 1rem;
      border: 1px solid currentcolor;
      border-radius: 0.5rem;
      text-decoration: none;
    }
  `,
})
export class ProjectDetailPage {
  readonly slug = input<string>();

  private readonly content = inject(ContentService);

  protected readonly contentReady = this.content.loaded;
  /** Non-null once the portfolio could not be read at all — a different story from "not found". */
  protected readonly error = this.content.error;
  protected readonly project = computed(() => this.content.bySlug(this.slug()));
  protected readonly demoUrl = computed(() => {
    const demo = this.project()?.demo;
    return demo?.kind === 'iframe' ? demo.url : null;
  });

  protected readonly readme = inject(ReadmeService).readme(
    computed(() => {
      const project = this.project();
      return project?.readme?.kind === 'bundled' ? project.slug : undefined;
    }),
    inject(Injector),
  );
}

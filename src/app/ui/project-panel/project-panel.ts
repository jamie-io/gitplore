import { Component, Injector, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ContentService } from '@content/content.service';
import { MarkdownComponent } from '@content/markdown/markdown.component';
import { ReadmeService } from '@content/readme.service';
import { FocusTrapDirective } from '../../shared/a11y/focus-trap.directive';
import { DemoFrame } from '../demo-frame/demo-frame';
import { DemoPanelHost } from '../demo-panel-host/demo-panel-host';
import { WorldStore } from '../store/world.store';

/**
 * A project destination, rendered over the still-running hub by the `/p/:slug` child route
 * (IMPLEMENTATION_PLAN.md §3). The iframe demo itself joins in M4.
 */
@Component({
  selector: 'app-project-panel',
  imports: [MarkdownComponent, FocusTrapDirective, DemoFrame, DemoPanelHost],
  template: `
    <div class="backdrop">
      <div
        appFocusTrap
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="project()?.title ?? 'Projekt nicht gefunden'"
        [style.--primary]="project()?.theme?.primary ?? '#333'"
        (keydown.escape)="close()"
      >
        <button class="close" type="button" data-role="close" (click)="close()">Schließen</button>

        @if (project(); as project) {
          <header>
            <h2>{{ project.title }}</h2>
            <p class="summary">{{ project.summary }}</p>
            <ul class="tags">
              @for (tag of project.tags; track tag) {
                <li>{{ tag }}</li>
              }
            </ul>
          </header>

          @if (project.demo.kind === 'iframe') {
            <section class="demo" aria-label="Demo">
              <app-demo-frame
                [url]="project.demo.url"
                [title]="project.title"
                [embeddable]="project.demo.embeddable"
                [screenshot]="project.demo.screenshot"
              />
            </section>
          } @else if (project.demo.kind === 'custom') {
            <section class="demo" aria-label="Demo">
              @switch (project.demo.mode) {
                @case ('panel') {
                  @if (project.demo.panelComponent; as load) {
                    <app-demo-panel-host [load]="load" />
                  }
                }
                @case ('in-world') {
                  <p>Die Demo dazu steht in der 3D-Welt, direkt neben dem Portal.</p>
                  <button type="button" data-role="try-in-world" (click)="tryInWorld(project.slug)">
                    In der Welt ausprobieren
                  </button>
                }
              }
            </section>
          }

          <nav class="actions">
            @if (demoUrl(); as url) {
              <a data-role="demo" [href]="url" target="_blank" rel="noopener noreferrer">
                Demo öffnen
              </a>
            }
            <a
              data-role="source"
              [href]="project.repoUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Quellcode
            </a>
          </nav>

          @if (project.readme) {
            @if (readme.isLoading()) {
              <p role="status">README wird geladen …</p>
            } @else if (readme.error()) {
              <p role="alert">
                Die README konnte nicht geladen werden – der Quellcode enthält sie.
              </p>
            } @else if (readme.value(); as markdown) {
              <app-markdown [markdown]="markdown" [topLevel]="3" />
            }
          }
        } @else if (contentReady()) {
          <h2>Projekt nicht gefunden</h2>
          <p>Für „{{ slug() }}“ gibt es keinen Eintrag.</p>
        }
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
    .panel {
      position: relative;
      inline-size: min(70rem, 100%);
      max-block-size: 100%;
      overflow: auto;
      padding: clamp(1rem, 3vw, 2rem);
      border-radius: 0.9rem;
      border-block-start: 5px solid var(--primary);
      background: #fff;
      color: #16202a;
      box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 35%);
    }
    .close {
      position: absolute;
      inset-block-start: 0.75rem;
      inset-inline-end: 0.75rem;
      padding: 0.4rem 0.9rem;
      border: 1px solid currentcolor;
      border-radius: 999px;
      background: transparent;
      cursor: pointer;
    }
    h2 {
      margin: 0 2rem 0.35rem 0;
      color: var(--primary);
    }
    .summary {
      margin: 0 0 0.6rem;
      max-inline-size: 60ch;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
    }
    .tags li {
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: rgb(0 0 0 / 7%);
      font-size: 0.8rem;
    }
    .demo {
      margin: 0 0 1rem;
    }
    .demo p {
      margin: 0 0 0.6rem;
    }
    .demo button {
      padding: 0.5rem 1rem;
      border: 0;
      border-radius: 0.5rem;
      background: var(--primary);
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-block-end: 1.25rem;
    }
    .actions a {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      background: var(--primary);
      color: #fff;
      text-decoration: none;
    }
    .actions a:last-child {
      background: transparent;
      color: inherit;
      border: 1px solid currentcolor;
    }
  `,
})
export class ProjectPanel {
  readonly slug = input<string>();

  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly store = inject(WorldStore);

  protected readonly contentReady = this.content.loaded;
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

  protected close(): void {
    void this.router.navigate(['/']);
  }

  /** Hands the demo request to the hub page, which owns the player and the landmark (§5). */
  protected tryInWorld(slug: string): void {
    // An explicit click on the demo counts as starting the world; no extra gate after it.
    this.store.markStarted();
    this.store.requestDemo(slug);
    this.close();
  }
}

import { Component, computed, input } from '@angular/core';
import type { Project } from '@content/project.model';
import {
  formatCommitActivityLines,
  formatInteger,
  formatLanguageLine,
  formatOptionalDate,
  hasRepositoryData,
  repositoryCommitActivity,
  repositoryLanguages,
  repositoryReleases,
  REPOSITORY_LABELS,
} from '@content/repository-data';

/** Plain-text counterpart of repository objects shown inside each 3D project world. */
@Component({
  selector: 'app-repository-data',
  template: `
    @if (hasData()) {
      <section class="repository-data" aria-labelledby="repository-data-title">
        @if (topLevel() === 2) {
          <h2 class="repository-data-title" id="repository-data-title">{{ labels.repository }}</h2>
        } @else {
          <h3 class="repository-data-title" id="repository-data-title">{{ labels.repository }}</h3>
        }

        @if (project().languages !== undefined) {
          <section aria-labelledby="languages-title">
            @if (topLevel() === 2) {
              <h3 id="languages-title">{{ labels.languages }}</h3>
            } @else {
              <h4 id="languages-title">{{ labels.languages }}</h4>
            }
            @if (languages().length > 0) {
              <ul>
                @for (language of languages(); track language.name) {
                  <li>{{ formatLanguageLine(language) }}</li>
                }
              </ul>
            } @else {
              <p>Keine Sprachdaten vorhanden.</p>
            }
          </section>
        }

        @if (project().commitBuckets !== undefined) {
          <section aria-labelledby="commits-title">
            @if (topLevel() === 2) {
              <h3 id="commits-title">{{ labels.commits }}</h3>
            } @else {
              <h4 id="commits-title">{{ labels.commits }}</h4>
            }
            @if (commitActivity(); as activity) {
              @for (line of formatCommitActivityLines(activity); track $index) {
                <p>{{ line }}</p>
              }
            }
          </section>
        }

        @if (releases().length > 0) {
          <section aria-labelledby="releases-title">
            @if (topLevel() === 2) {
              <h3 id="releases-title">{{ labels.releases }}</h3>
            } @else {
              <h4 id="releases-title">{{ labels.releases }}</h4>
            }
            <ul>
              @for (release of releases(); track release.name + release.date) {
                <li>
                  {{ release.name }}
                  @if (release.date) {
                    <span> · {{ release.date }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <dl class="metrics">
          @if ((project().stars ?? 0) > 0) {
            <div>
              <dt>{{ labels.stars }}</dt>
              <dd>{{ formatInteger(project().stars ?? 0) }}</dd>
            </div>
          }
          @if ((project().forks ?? 0) > 0) {
            <div>
              <dt>{{ labels.forks }}</dt>
              <dd>{{ formatInteger(project().forks ?? 0) }}</dd>
            </div>
          }
          @if ((project().openIssues ?? 0) > 0) {
            <div>
              <dt>{{ labels.openIssues }}</dt>
              <dd>{{ formatInteger(project().openIssues ?? 0) }}</dd>
            </div>
          }
          @if (project().license !== undefined) {
            <div>
              <dt>{{ labels.license }}</dt>
              <dd>{{ project().license ?? labels.licenseMissing }}</dd>
            </div>
          }
          @if (createdAt(); as createdAt) {
            <div>
              <dt>{{ labels.created }}</dt>
              <dd>{{ createdAt }}</dd>
            </div>
          }
        </dl>
      </section>
    }
  `,
  styles: `
    .repository-data {
      margin-block: 1.5rem;
      padding-block-start: 1rem;
      border-block-start: 1px solid rgb(0 0 0 / 15%);
    }
    h2,
    h3,
    h4 {
      margin-block: 0 0.45rem;
      color: inherit;
      line-height: 1.25;
    }
    h2 {
      font-size: 1.35rem;
    }
    h3 {
      font-size: 1rem;
    }
    h4 {
      font-size: 0.95rem;
    }
    section + section {
      margin-block-start: 1rem;
    }
    ul {
      margin: 0;
      padding-inline-start: 1.25rem;
    }
    p {
      margin: 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 0.75rem 1rem;
      margin: 1rem 0 0;
    }
    .metrics div {
      padding: 0.55rem 0.7rem;
      border-radius: 0.45rem;
      background: rgb(0 0 0 / 5%);
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0.15rem 0 0;
    }
  `,
})
export class RepositoryData {
  readonly project = input.required<Project>();
  /** Heading level where this component starts; child headings are one level deeper. */
  readonly topLevel = input(2);
  protected readonly labels = REPOSITORY_LABELS;

  protected readonly languages = computed(() => repositoryLanguages(this.project()));

  protected readonly commitActivity = computed(() => repositoryCommitActivity(this.project()));

  protected readonly releases = computed(() => repositoryReleases(this.project()));

  protected readonly createdAt = computed(() => formatOptionalDate(this.project().createdAt));

  protected readonly hasData = computed(() => hasRepositoryData(this.project()));

  protected readonly formatInteger = formatInteger;
  protected readonly formatLanguageLine = formatLanguageLine;
  protected readonly formatCommitActivityLines = formatCommitActivityLines;
}

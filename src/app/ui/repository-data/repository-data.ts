import { Component, computed, input } from '@angular/core';
import type { Project } from '@content/project.model';

const INTEGER_FORMAT = new Intl.NumberFormat('de-DE');
const PERCENT_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'long',
  timeZone: 'UTC',
});

interface LanguageRow {
  readonly name: string;
  readonly bytes: number;
  readonly share: number;
}

interface CommitActivity {
  readonly total: number;
  readonly activeBuckets: number;
  readonly bucketCount: number;
  readonly peak: number;
  readonly start?: string;
  readonly end?: string;
}

interface ReleaseRow {
  readonly name: string;
  readonly date?: string;
}

/** Plain-text counterpart of repository objects shown inside each 3D project world. */
@Component({
  selector: 'app-repository-data',
  template: `
    @if (hasData()) {
      <section class="repository-data" aria-labelledby="repository-data-title">
        @if (topLevel() === 2) {
          <h2 class="repository-data-title" id="repository-data-title">Repositorydaten</h2>
        } @else {
          <h3 class="repository-data-title" id="repository-data-title">Repositorydaten</h3>
        }

        @if (project().languages !== undefined) {
          <section aria-labelledby="languages-title">
            @if (topLevel() === 2) {
              <h3 id="languages-title">Sprachen</h3>
            } @else {
              <h4 id="languages-title">Sprachen</h4>
            }
            @if (languages().length > 0) {
              <ul>
                @for (language of languages(); track language.name) {
                  <li>
                    {{ language.name }}: {{ formatInteger(language.bytes) }} Bytes ({{
                      formatPercent(language.share)
                    }}
                    %)
                  </li>
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
              <h3 id="commits-title">Commit-Aktivität</h3>
            } @else {
              <h4 id="commits-title">Commit-Aktivität</h4>
            }
            @if (commitActivity(); as activity) {
              @if (activity.total === 0) {
                <p>Keine Commits im erfassten Zeitraum.</p>
              } @else if (activity.start && activity.end) {
                @if (activity.start === activity.end) {
                  <p>
                    {{ formatInteger(activity.total) }}
                    {{ activity.total === 1 ? 'Commit' : 'Commits' }} am {{ activity.start }}.
                  </p>
                } @else {
                  <p>
                    {{ formatInteger(activity.total) }}
                    {{ activity.total === 1 ? 'Commit' : 'Commits' }} im Zeitraum vom
                    {{ activity.start }} bis {{ activity.end }}.
                  </p>
                }
              } @else {
                <p>
                  {{ formatInteger(activity.total) }}
                  {{ activity.total === 1 ? 'Commit' : 'Commits' }} in der erfassten Aktivität.
                </p>
              }
              @if (activity.total > 0) {
                <p>
                  Verteilt auf {{ formatInteger(activity.activeBuckets) }} von
                  {{ formatInteger(activity.bucketCount) }} Zeitabschnitten; stärkster
                  Zeitabschnitt:
                  {{ formatInteger(activity.peak) }}
                  {{ activity.peak === 1 ? 'Commit' : 'Commits' }}.
                </p>
              }
            }
          </section>
        }

        @if (releases().length > 0) {
          <section aria-labelledby="releases-title">
            @if (topLevel() === 2) {
              <h3 id="releases-title">Veröffentlichungen</h3>
            } @else {
              <h4 id="releases-title">Veröffentlichungen</h4>
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
              <dt>Sterne</dt>
              <dd>{{ formatInteger(project().stars ?? 0) }}</dd>
            </div>
          }
          @if ((project().forks ?? 0) > 0) {
            <div>
              <dt>Forks</dt>
              <dd>{{ formatInteger(project().forks ?? 0) }}</dd>
            </div>
          }
          @if ((project().openIssues ?? 0) > 0) {
            <div>
              <dt>Offene Issues</dt>
              <dd>{{ formatInteger(project().openIssues ?? 0) }}</dd>
            </div>
          }
          @if (project().license !== undefined) {
            <div>
              <dt>Lizenz</dt>
              <dd>{{ project().license ?? 'Keine Lizenz angegeben' }}</dd>
            </div>
          }
          @if (createdAt(); as createdAt) {
            <div>
              <dt>Erstellt</dt>
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

  protected readonly languages = computed<readonly LanguageRow[]>(() => {
    const entries = Object.entries(this.project().languages ?? {})
      .filter(([, bytes]) => Number.isFinite(bytes) && bytes > 0)
      .sort(([leftName, leftBytes], [rightName, rightBytes]) => {
        const byteOrder = rightBytes - leftBytes;
        return byteOrder !== 0 ? byteOrder : leftName.localeCompare(rightName, 'en');
      });
    const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

    return entries.map(([name, bytes]) => ({
      name,
      bytes,
      share: total > 0 ? bytes / total : 0,
    }));
  });

  protected readonly commitActivity = computed<CommitActivity | undefined>(() => {
    const buckets = this.project().commitBuckets;
    if (buckets === undefined) {
      return undefined;
    }

    const values = buckets.map((value) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0,
    );
    const total = values.reduce((sum, value) => sum + value, 0);
    const dates = [this.project().createdAt, this.project().firstCommitAt]
      .map(parseDate)
      .filter((value): value is number => value !== undefined);
    const pushedAt = parseDate(this.project().pushedAt);
    const start = dates.length > 0 ? formatDate(new Date(Math.min(...dates))) : undefined;
    const end = pushedAt === undefined ? undefined : formatDate(new Date(pushedAt));

    return {
      total,
      activeBuckets: values.filter((value) => value > 0).length,
      bucketCount: values.length,
      peak: values.reduce((highest, value) => Math.max(highest, value), 0),
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
    };
  });

  protected readonly releases = computed<readonly ReleaseRow[]>(() =>
    (this.project().releases ?? []).map((release) => {
      const date = formatOptionalDate(release.date);
      return date === undefined ? { name: release.name } : { name: release.name, date };
    }),
  );

  protected readonly createdAt = computed(() => formatOptionalDate(this.project().createdAt));

  protected readonly hasData = computed(() => {
    const project = this.project();
    return (
      project.languages !== undefined ||
      project.commitBuckets !== undefined ||
      project.releases !== undefined ||
      project.stars !== undefined ||
      project.forks !== undefined ||
      project.openIssues !== undefined ||
      project.license !== undefined ||
      project.createdAt !== undefined
    );
  });

  protected formatInteger(value: number): string {
    return INTEGER_FORMAT.format(value);
  }

  protected formatPercent(value: number): string {
    return PERCENT_FORMAT.format(value * 100);
  }
}

function parseDate(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatOptionalDate(value: string | undefined): string | undefined {
  const parsed = parseDate(value);
  return parsed === undefined ? undefined : formatDate(new Date(parsed));
}

function formatDate(value: Date): string {
  return DATE_FORMAT.format(value);
}

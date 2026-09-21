import type { Project } from './project.model';

const INTEGER_FORMAT = new Intl.NumberFormat('de-DE');
const PERCENT_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'long',
  timeZone: 'UTC',
});

export const REPOSITORY_LABELS = {
  repository: 'Repositorydaten',
  project: 'Projekt',
  languages: 'Sprachen',
  commits: 'Commit-Aktivität',
  releases: 'Veröffentlichungen',
  metrics: 'Kennzahlen',
  stars: 'Sterne',
  forks: 'Forks',
  openIssues: 'Offene Issues',
  license: 'Lizenz',
  licenseMissing: 'Keine Lizenz angegeben',
  created: 'Erstellt',
  firstCommit: 'Erster Commit',
  lastPush: 'Letzter Push',
} as const;

export interface LanguageRow {
  readonly name: string;
  readonly bytes: number;
  readonly share: number;
}

export interface CommitActivity {
  readonly total: number;
  readonly activeBuckets: number;
  readonly bucketCount: number;
  readonly peak: number;
  readonly start?: string;
  readonly end?: string;
}

export interface ReleaseRow {
  readonly name: string;
  readonly date?: string;
}

export function formatInteger(value: number): string {
  return INTEGER_FORMAT.format(value);
}

export function formatPercent(value: number): string {
  return PERCENT_FORMAT.format(value * 100);
}

export function parseDate(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatDate(value: Date): string {
  return DATE_FORMAT.format(value);
}

export function formatOptionalDate(value: string | undefined): string | undefined {
  const parsed = parseDate(value);
  return parsed === undefined ? undefined : formatDate(new Date(parsed));
}

export function repositoryLanguages(project: Project): readonly LanguageRow[] {
  const entries = Object.entries(project.languages ?? {})
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
}

export function repositoryCommitActivity(project: Project): CommitActivity | undefined {
  const buckets = project.commitBuckets;
  if (buckets === undefined) {
    return undefined;
  }

  const values = buckets.map((value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0,
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  const dates = [project.createdAt, project.firstCommitAt]
    .map(parseDate)
    .filter((value): value is number => value !== undefined);
  const pushedAt = parseDate(project.pushedAt);
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
}

export function repositoryReleases(project: Project): readonly ReleaseRow[] {
  return (project.releases ?? []).map((release) => {
    const date = formatOptionalDate(release.date);
    return date === undefined ? { name: release.name } : { name: release.name, date };
  });
}

/** One language row, as the project page lists it and the terminal prints it. */
export function formatLanguageLine(language: LanguageRow): string {
  return `${language.name}: ${formatInteger(language.bytes)} Bytes (${formatPercent(language.share)} %)`;
}

/**
 * The German sentences about a repository's commit history, shared by the project page and the
 * in-world terminal so the two can never word the same fact differently.
 */
export function formatCommitActivityLines(activity: CommitActivity): readonly string[] {
  if (activity.total === 0) {
    return ['Keine Commits im erfassten Zeitraum.'];
  }

  const lines: string[] = [];
  if (activity.start && activity.end) {
    if (activity.start === activity.end) {
      lines.push(
        `${formatInteger(activity.total)} ${activity.total === 1 ? 'Commit' : 'Commits'} am ${activity.start}.`,
      );
    } else {
      lines.push(
        `${formatInteger(activity.total)} ${activity.total === 1 ? 'Commit' : 'Commits'} im Zeitraum vom ${activity.start} bis ${activity.end}.`,
      );
    }
  } else {
    lines.push(
      `${formatInteger(activity.total)} ${activity.total === 1 ? 'Commit' : 'Commits'} in der erfassten Aktivität.`,
    );
  }

  lines.push(
    `Verteilt auf ${formatInteger(activity.activeBuckets)} von ${formatInteger(activity.bucketCount)} Zeitabschnitten; stärkster Zeitabschnitt: ${formatInteger(activity.peak)} ${activity.peak === 1 ? 'Commit' : 'Commits'}.`,
  );
  return lines;
}

export function formatReleaseLine(release: ReleaseRow): string {
  return release.date === undefined ? release.name : `${release.name} · ${release.date}`;
}

export function hasRepositoryData(project: Project): boolean {
  return (
    project.languages !== undefined ||
    project.commitBuckets !== undefined ||
    project.releases !== undefined ||
    (project.stars ?? 0) > 0 ||
    (project.forks ?? 0) > 0 ||
    (project.openIssues ?? 0) > 0 ||
    project.license !== undefined ||
    project.createdAt !== undefined
  );
}

import type { EnvironmentId, ProjectDemo, ProjectLandmark } from './project.model';

/**
 * Everything GitHub cannot express about one of Jamie's repositories, keyed by repository name
 * (docs/superpowers/specs/2026-09-10-repo-worlds-design.md §4).
 *
 * German copy lives here because GitHub holds none and the site is German. Anything that is code
 * — a bespoke landmark kind, a panel component — necessarily lives here too.
 */
export interface RepoOverride {
  /** Keeps the repository out of the world entirely. */
  readonly hidden?: boolean;
  /** Defaults to the repository name, lowercased. */
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly year?: number;
  readonly demo?: ProjectDemo;
  readonly landmark?: Partial<ProjectLandmark>;
  /** Which reusable world stands behind the portal. Defaults to `'showroom'`. */
  readonly environment?: EnvironmentId;
  readonly theme?: { readonly primary: string; readonly accent: string };
}

export const REPO_OVERRIDES: Readonly<Record<string, RepoOverride>> = {
  gitplore: {
    title: 'Gitplore',
    summary:
      'Dieses Portfolio selbst: eine begehbare 3D-Welt, in der jedes öffentliche Repository als Landmarke steht. Angular 22 zoneless mit Signals, Three.js direkt statt über einen Wrapper, Gelände und Bauten prozedural im Code erzeugt.',
    tags: ['Angular 22', 'Three.js', 'TypeScript', 'WebGL2'],
    environment: 'plaza',
    theme: { primary: '#4a3f8f', accent: '#ecebf6' },
  },
  webkatalog_demoshop: {
    title: 'Nordwerk – Demoshop für den 3D office WebKatalog',
    summary:
      'Vollständiger B2B-Möbelshop eines fiktiven Fachhändlers als Vertriebsmittel: Produktdaten, Preise, Bilder und 3D-Konfiguration kommen aus dem WebKatalog. Statisches HTML mit ES-Modulen, ohne Build und ohne Backend — von der Startseite bis zu Bestellung, Angebot und OCI-5.0-Übergabe.',
    tags: ['JavaScript', 'ES Modules', 'B2B E-Commerce', 'OCI 5.0'],
    environment: 'showroom',
    theme: { primary: '#8f6a2f', accent: '#f6f0ea' },
  },
  novaverta: {
    title: 'Phönix Industriedienstleistungen',
    summary:
      'Website für den deutschen Generalimporteur der NOVA VERTA Lackierkabinen. Reines HTML, CSS und JavaScript, ohne Build-Schritt und ohne Laufzeitabhängigkeiten.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Static Site'],
    year: 2026,
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/novaverta/',
      embeddable: true,
      screenshot: 'assets/screens/novaverta.webp',
    },
    landmark: { kind: 'screen', position: [-24, 0, -18], rotationY: 0.6 },
    environment: 'showroom',
    theme: { primary: '#1b4f8f', accent: '#e8eef6' },
  },
  'poetzscher-homepage': {
    slug: 'poetzscher',
    title: 'Christopher Pötzsch – Objektservice',
    summary:
      'Statische Website für Objektservice und Gebäudetechnik, bewusst ohne externe Verbindungen: lokale Schriften, kein Analytics, kein Cookie-Banner.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Privacy by design'],
    year: 2026,
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/poetzscher-homepage/',
      embeddable: true,
      screenshot: 'assets/screens/poetzscher.webp',
    },
    landmark: { kind: 'screen', position: [26, 0, -14], rotationY: -0.7 },
    environment: 'showroom',
    theme: { primary: '#2f6b4f', accent: '#eaf2ec' },
  },
  deslopify: {
    title: 'Deslopify',
    summary:
      'Browser-Erweiterung, die von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale der Urheber ersetzt.',
    tags: ['JavaScript', 'Chrome Extension', 'MV3'],
    year: 2026,
    demo: { kind: 'custom', mode: 'in-world' },
    landmark: {
      kind: 'deslopify',
      position: [0, 0, -20],
      rotationY: 0,
      model: 'assets/models/arch.glb',
    },
    environment: 'jungle',
    theme: { primary: '#8f2f2f', accent: '#f6eaea' },
  },
};

/**
 * Extracts repository names marked as hidden. Takes the record as a parameter so the
 * filter can be tested against fixtures rather than against production data.
 */
export function hiddenNamesIn(overrides: Readonly<Record<string, RepoOverride>>): string[] {
  return Object.entries(overrides)
    .filter(([, override]) => override.hidden)
    .map(([name]) => name);
}

/** The repositories the sync must leave out, for `scripts/sync-repos.mjs`. */
export function hiddenRepoNames(): string[] {
  return hiddenNamesIn(REPO_OVERRIDES);
}

/** The repositories the sync must keep whatever the cap says, for `scripts/sync-repos.mjs`. */
export function curatedRepoNames(): string[] {
  return Object.keys(REPO_OVERRIDES);
}

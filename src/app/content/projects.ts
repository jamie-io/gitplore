import type { Project } from './project.model';

/**
 * The curated portfolio. Adding a project means adding an entry here — the schema test in
 * `projects.spec.ts` guards slugs, screenshots and the demo union (IMPLEMENTATION_PLAN.md §4).
 */
export const PROJECTS: readonly Project[] = [
  {
    slug: 'novaverta',
    title: 'Phönix Industriedienstleistungen',
    summary:
      'Website für den deutschen Generalimporteur der NOVA VERTA Lackierkabinen. Reines HTML, CSS und JavaScript, ohne Build-Schritt und ohne Laufzeitabhängigkeiten.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Static Site'],
    repoUrl: 'https://github.com/jamie-io/novaverta',
    year: 2026,
    readme: { kind: 'bundled', path: 'content/readme/novaverta.md' },
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/novaverta/',
      embeddable: true,
      screenshot: 'assets/screens/novaverta.webp',
    },
    landmark: { kind: 'screen', position: [-24, 0, -18], rotationY: 0.6 },
    theme: { primary: '#1b4f8f', accent: '#e8eef6' },
  },
  {
    slug: 'poetzscher',
    title: 'Christopher Pötzsch – Objektservice',
    summary:
      'Statische Website für Objektservice und Gebäudetechnik, bewusst ohne externe Verbindungen: lokale Schriften, kein Analytics, kein Cookie-Banner.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Privacy by design'],
    repoUrl: 'https://github.com/jamie-io/poetzscher-homepage',
    year: 2026,
    readme: { kind: 'bundled', path: 'content/readme/poetzscher.md' },
    demo: {
      kind: 'iframe',
      url: 'https://jamie-io.github.io/poetzscher-homepage/',
      embeddable: true,
      screenshot: 'assets/screens/poetzscher.webp',
    },
    landmark: { kind: 'screen', position: [26, 0, -14], rotationY: -0.7 },
    theme: { primary: '#2f6b4f', accent: '#eaf2ec' },
  },
  {
    slug: 'deslopify',
    title: 'Deslopify',
    summary:
      'Browser-Erweiterung, die von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale der Urheber ersetzt.',
    tags: ['JavaScript', 'Chrome Extension', 'MV3'],
    repoUrl: 'https://github.com/jamie-io/deslopify',
    year: 2026,
    readme: { kind: 'bundled', path: 'content/readme/deslopify.md' },
    demo: { kind: 'custom', mode: 'in-world' },
    landmark: { kind: 'portal', position: [0, 0, -34], rotationY: 0 },
    theme: { primary: '#8f2f2f', accent: '#f6eaea' },
  },
];

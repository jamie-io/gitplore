// Drafted on 2026-09-21 from Jamie's LinkedIn profile text, in its own German wording, to be
// revised by Jamie. Nothing here may be reworded into a claim the source does not make: a dated
// station or a named project is data, praise is not.

/**
 * A period as ISO-8601 calendar dates cut to year or month: `2020`, `2020-08`. `to` absent means
 * the station is still running.
 */
export interface Period {
  readonly from: string;
  readonly to?: string;
}

export interface AboutLink {
  readonly label: string;
  readonly href: string;
}

export interface CareerStation {
  readonly period: Period;
  readonly title: string;
  /** Left out where the source names none, e.g. an exchange programme. */
  readonly organisation?: string;
  /** Left out where the source names none for this station. */
  readonly place?: string;
  /** The LinkedIn section the station stands in: work experience or education. */
  readonly section: 'beruf' | 'bildung';
  readonly note?: string;
}

export interface WorkProject {
  readonly slug: string;
  readonly title: string;
  /** Left out: the source dates the employment, not each project. */
  readonly period?: Period;
  readonly stack: readonly string[];
  /** Jamie's part, only where the source states it. */
  readonly role?: string;
  readonly points: readonly string[];
  /** A public repository's project slug this work shares a world with. */
  readonly relatedRepo?: string;
}

export interface Testimonial {
  readonly quote: string;
  readonly source: string;
  readonly date: string;
}

export interface AboutDocument {
  readonly label: string;
  /** The file format, named in every link to it. */
  readonly format: string;
  /** Relative to the base href, so the same build works on Pages and on an own server. */
  readonly href: string;
  /** The file's size on disk; `about.spec.ts` compares it with the committed file. */
  readonly bytes: number;
}

export interface About {
  readonly profile: {
    readonly name: string;
    readonly role: string;
    readonly summary: string;
    readonly email: string;
    readonly links: readonly AboutLink[];
  };
  /** Only what the source states; an empty field is not rendered. */
  readonly availability: {
    readonly from: string;
    readonly regions: readonly string[];
    readonly roles: readonly string[];
  };
  /** Oldest first. */
  readonly career: readonly CareerStation[];
  readonly workProjects: readonly WorkProject[];
  /** Stated skills. Languages measured from the public repositories come from T8, not from here. */
  readonly skills: readonly { readonly name: string; readonly source: 'beruf' }[];
  /** Empty until Jamie picks quotes (T10d); nothing renders for an empty list. */
  readonly testimonials: readonly Testimonial[];
  readonly documents: readonly AboutDocument[];
}

/**
 * Everything the site says about Jamie, in one typed object: the home base in the start world,
 * the contact dialog and the `/projects` header all read it, so no fact is written twice.
 */
export const ABOUT: About = {
  profile: {
    name: 'Jamie Jahn',
    role: 'Fachinformatiker Anwendungsentwicklung (Abschluss Winter 2026)',
    summary:
      'Ich entwickle Software an zwei Enden, die selten zusammen auftreten: gewachsene Produktsoftware in Delphi und moderne Weboberflächen mit Angular und TypeScript.',
    email: 'jamiejahn68@gmail.com',
    links: [{ label: 'GitHub', href: 'https://github.com/jamie-io' }],
  },
  availability: {
    from: '2027-02',
    regions: ['Halle', 'Leipzig', 'Bitterfeld', 'remote'],
    roles: ['Softwareentwickler'],
  },
  career: [
    {
      period: { from: '2012', to: '2020' },
      title: 'Allgemeine Hochschulreife',
      organisation: 'Heinrich-Heine-Gymnasium Wolfen',
      section: 'bildung',
    },
    {
      period: { from: '2020-08', to: '2022-12' },
      title: 'Ausbildung Industriekaufmann',
      organisation: 'ArcelorMittal Construction Deutschland GmbH',
      section: 'beruf',
      note: 'Verkürzt abgeschlossen, anschließend Übernahmeangebot erhalten.',
    },
    {
      period: { from: '2022', to: '2022' },
      title: 'Erasmus+ Mobilitätsprogramm',
      place: 'Córdoba und Mallorca',
      section: 'bildung',
    },
    {
      period: { from: '2022-12', to: '2024-01' },
      title: 'Kaufmännischer Mitarbeiter Logistik',
      organisation: 'ArcelorMittal Construction Deutschland GmbH',
      place: 'Sandersdorf-Brehna',
      section: 'beruf',
      note: 'Auftragsabwicklung und Disposition von Transportaufträgen.',
    },
    {
      period: { from: '2024', to: '2026' },
      title: 'Fachinformatiker für Anwendungsentwicklung',
      organisation: 'BbS "Gutjahr"',
      place: 'Halle (Saale)',
      section: 'bildung',
    },
    {
      period: { from: '2024-09' },
      title: 'Auszubildender Fachinformatiker für Anwendungsentwicklung',
      organisation: 'ub.unitel GmbH',
      place: 'Sandersdorf-Brehna',
      section: 'beruf',
      note: 'Vorzeitige Zulassung zur Abschlussprüfung durch die IHK Halle-Dessau, Abschluss Winter 2026.',
    },
  ],
  workProjects: [
    {
      slug: 'ofml-datensuite',
      title: 'OFML-Datensuite (PDC, MDC, OCD)',
      stack: ['Delphi'],
      role: 'Mitarbeit an der Weiterentwicklung',
      points: [
        'Kommerzielle Software zur Erstellung von Herstellerdaten, vollständig in Delphi entwickelt und bei Herstellern im täglichen Einsatz.',
      ],
    },
    {
      slug: 'ticketsystem',
      title: 'Ticketsystem für Assets, Tickets, Leistungen und Abrechnung',
      stack: ['Angular', 'SharePoint'],
      points: [
        'Umgesetzt in Angular, inklusive Migration gewachsener SharePoint-Altdaten mit Prüflogik für nicht auflösbare Zuordnungen.',
      ],
    },
    {
      slug: '3d-produktkatalog',
      title: '3D-Produktkatalog im Browser',
      stack: ['WebGL', 'OCI 5.0'],
      points: [
        'Echtzeit-Rendering per WebGL',
        'Konfigurator',
        'OCI-5.0-Übergabe an Beschaffungssysteme',
      ],
      relatedRepo: 'webkatalog_demoshop',
    },
    {
      slug: 'kundenportal',
      title: 'Kundenportal',
      stack: [],
      role: 'Eigenverantwortlich von der Konzeption bis zur Auslieferung',
      points: ['Von der Konzeption bis zur Auslieferung eigenverantwortlich umgesetzt.'],
    },
  ],
  skills: [
    'Delphi',
    'TypeScript',
    'Angular',
    'JavaScript',
    'C#',
    'Python',
    'Firebird',
    'Linux',
    'Git',
    'Three.js',
    'WebGL',
    'SharePoint',
    'Datenmigration',
  ].map((name) => ({ name, source: 'beruf' as const })),
  testimonials: [],
  documents: [
    {
      label: 'Lebenslauf',
      format: 'PDF',
      href: 'docs/Lebenslauf-Jamie-Jahn.pdf',
      bytes: 147_025,
    },
  ],
};

/** "Lebenslauf, PDF, 144 kB": every link to a document names its format and size. */
export function documentLinkText(document: AboutDocument): string {
  return `${document.label}, ${document.format}, ${Math.round(document.bytes / 1024)} kB`;
}

/** The address as a `mailto:` link; the address itself is never written into `index.html`. */
export function mailtoHref(email: string): string {
  return `mailto:${email}`;
}

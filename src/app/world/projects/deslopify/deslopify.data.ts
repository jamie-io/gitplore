/**
 * The canonical Deslopify content: the four feed cards, the four metadata tags, the badges,
 * the captions, the in-world prompts, the shared palette, and the Lichtung's plates, station
 * names, toasts, pitch and moment banner. Both string variants of every
 * card and tag live here so no consumer reconstructs copy by parsing display strings
 * (spec §"Four canonical feed cards", §"Four canonical tags").
 */
export interface FeedCardData {
  /** The auto-translated German title the extension replaces. */
  readonly slop: string;
  readonly original: string;
  /** Thumbnail background colour. */
  readonly bg: string;
  /** Big word drawn over the original thumbnail. */
  readonly word: string;
  readonly wordColor: string;
  readonly sub: string;
  /** Thumbnail word for the slop state. */
  readonly slopThumb: string;
  readonly avatar: string;
  readonly avatarBg: string;
  /** German metadata line: channel, views, age. */
  readonly meta: string;
  readonly duration: string;
  readonly channel: string;
}

export const FEED_CARDS: readonly FeedCardData[] = [
  {
    slop: 'Rost in 100 Sekunden',
    original: 'Rust in 100 Seconds',
    bg: '#1b1d1f',
    word: 'RUST',
    wordColor: '#e0a13c',
    sub: 'in 100 seconds',
    slopThumb: 'ROST IN 100 SEKUNDEN',
    avatar: 'F',
    avatarBg: '#b5532a',
    meta: 'ferris.dev · 1,2 Mio. Aufrufe · vor 3 Jahren',
    duration: '1:40',
    channel: 'ferris.dev',
  },
  {
    slop: 'Ich habe eine Tastatur von Kratzer gebaut',
    original: 'I built a keyboard from scratch',
    bg: '#2f5d57',
    word: 'SCRATCH',
    wordColor: '#f4efe4',
    sub: 'keyboard build',
    slopThumb: 'VON KRATZER',
    avatar: 'K',
    avatarBg: '#2f5d57',
    meta: 'keeb lab · 418.000 Aufrufe · vor 1 Jahr',
    duration: '18:22',
    channel: 'keeb lab',
  },
  {
    slop: 'Warum der Himmel blau ist',
    original: 'Why the sky is blue',
    bg: '#2b5f8f',
    word: 'BLUE?',
    wordColor: '#f4efe4',
    sub: 'rayleigh scattering',
    slopThumb: 'WARUM BLAU?',
    avatar: 'S',
    avatarBg: '#2b5f8f',
    meta: 'sky physics · 86.000 Aufrufe · vor 2 Jahren',
    duration: '9:05',
    channel: 'sky physics',
  },
  {
    slop: 'Git Basis neu, erklärt',
    original: 'Git rebase, explained',
    bg: '#26262e',
    word: 'REBASE',
    wordColor: '#86e0cf',
    sub: 'git rebase -i',
    slopThumb: 'BASIS NEU',
    avatar: 'G',
    avatarBg: '#6b4712',
    meta: 'git gud · 240.000 Aufrufe · vor 5 Jahren',
    duration: '12:31',
    channel: 'git gud',
  },
];

/** One hanging tag: its slop label, its original label and the detail behind each. */
export interface SlopTagData {
  readonly slop: string;
  readonly original: string;
  readonly slopDetail: string;
  readonly originalDetail: string;
}

export const SLOP_TAGS: readonly SlopTagData[] = [
  {
    slop: 'Kapitel · übersetzt',
    original: 'Chapter · original',
    slopDetail: 'Kapitel 3: Die Platine löten',
    originalDetail: 'Chapter 3: Soldering the PCB',
  },
  {
    slop: 'Tonspur · KI',
    original: 'Audio · original',
    slopDetail: 'Deutsch (KI-Synchronisation)',
    originalDetail: 'English (original)',
  },
  {
    slop: 'Kanalname · übersetzt',
    original: 'Channel · original',
    slopDetail: 'Schlüsselbrett-Labor',
    originalDetail: 'keeb lab',
  },
  {
    slop: 'Beschreibung · übersetzt',
    original: 'Description · original',
    slopDetail: 'In diesem Video bauen wir …',
    originalDetail: 'In this video we build …',
  },
];

/** The card badge under the metadata line, once translated and once original. */
export const BADGE = {
  translated: 'Automatisch übersetzt · Audio: Deutsch (KI)',
  original: 'Original · Englisch',
} as const;

/** The caption strip above each thumbnail. */
export const CAPTION = { translated: 'ÜBERSETZT · translated', original: 'ORIGINAL' } as const;

/** In-world `E` prompts, German first (spec §"Vines, prompts, events, map strings"). */
export const PROMPTS = {
  wallOn: 'Deslopify einschalten',
  wallOff: 'Deslopify ausschalten',
  liana: 'Liane ziehen',
  steleEnter: 'Terminal bedienen',
  steleLeave: 'Terminal verlassen',
  exhibit: 'Details, README & Code',
  cave: 'Höhle betreten',
  lanternOn: 'Laterne anzünden',
  lanternOff: 'Laterne löschen',
} as const;

/**
 * What the exhibit poster says beyond the project's own summary (spec §"HUD, map, poster, terminal
 * copy"): the kicker, the English line, and the second card's before and after.
 */
export const POSTER = {
  kicker: 'Projekt · Browser-Erweiterung',
  prompt: PROMPTS.exhibit,
  englishSummary:
    'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
  comparison: { without: FEED_CARDS[1].slop, with: FEED_CARDS[1].original },
} as const;

/** The world's in-world demo hint: the wall is what "try it in the world" leads to. */
export const DEMO_HINT = 'E an der Wand: Deslopify aus- und einschalten · R Neustart';

/** Colours shared by the cards, the ground props and the stele. */
export const PALETTE = {
  original: '#e0a13c',
  slop: '#9a3f8d',
  slopLine: 'oklch(0.68 0.19 335)',
  wood: '#5a3d27',
  stele: '#141b17',
  ink: '#f4efe4',
  engrave: '#f4e6c8',
} as const;

/**
 * One plate of the HUD's bottom-left card: the German kicker, title and text with the one-line
 * English summary under it. This is the structural type Task 3's `StationPlate` will hold, so
 * the copy here does not wait for it (spec §"Plate (HUD)").
 */
export interface PlateCopy {
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
  readonly en: string;
}

/**
 * The plate copy for the portal, the seven stations and the three finds, verbatim from
 * spec §"Plates (Deslopify)". The steps, language and release plates take their numbers from
 * the project data, so they are functions of that value.
 */
export const PLATES: {
  readonly portal: PlateCopy;
  readonly laterne: PlateCopy;
  readonly pfad: PlateCopy;
  readonly stufen: (commits: number) => PlateCopy;
  readonly bogen: PlateCopy;
  readonly exponat: PlateCopy;
  readonly wandOn: PlateCopy;
  readonly wandOff: PlateCopy;
  readonly hoehle: PlateCopy;
  readonly langs: (line: string) => PlateCopy;
  readonly cairn: (release: string | null) => PlateCopy;
  readonly liana: PlateCopy;
} = {
  portal: {
    kicker: 'Ankunft',
    title: 'Deslopify',
    text: 'Browser-Erweiterung für YouTube. Ersetzt automatisch übersetzte Titel, Thumbnails und KI-Tonspuren durch die Originale.',
    en: 'A browser extension that brings back original YouTube titles, thumbnails and audio. Follow the lantern.',
  },
  laterne: {
    kicker: 'Station 1',
    title: 'Die Laterne',
    text: 'Ihr Licht zeigt unter dem Slop kurz das Original. Sobald du weitergehst, wächst er nach.',
    en: 'Its light shows the original for a moment. The slop grows back behind you.',
  },
  pfad: {
    kicker: 'Station 2',
    title: 'Feed-Pfad',
    text: 'Vier Karten aus einem Feed, dazu Kapitel, Tonspur, Kanalname und Beschreibung an den Ranken.',
    en: 'Four cards from a feed, plus chapters, audio, channel name and description on the vines.',
  },
  stufen: (commits: number) => ({
    kicker: 'Station 3',
    title: 'Commit-Stufen',
    text: `Elf Stufen hinauf zum Bogen, eine pro Zeitabschnitt. Stufen mit Commits leuchten. Bisher ${commits} Commit${commits === 1 ? '' : 's'}.`,
    en: 'Eleven steps up to the arch, one per period. Lit steps had commits.',
  }),
  bogen: {
    kicker: 'Station 4',
    title: 'Der Bogen',
    text: 'Unter dem Bogen wird Deslopify installiert. Ab hier bleibt der Dschungel entslopt.',
    en: 'Walking under the arch installs the extension. The whole clearing is cleaned.',
  },
  exponat: {
    kicker: 'Station 5',
    title: 'Exponat',
    text: 'Das Projekt als Poster. E öffnet Details, README und Code.',
    en: 'The project poster.',
  },
  wandOn: {
    kicker: 'Station 6',
    title: 'Feed-Wand',
    text: 'E schaltet Deslopify aus und wieder an. So siehst du beide Versionen direkt hintereinander.',
    en: 'E toggles the extension for a direct comparison.',
  },
  wandOff: {
    kicker: 'Station 6',
    title: 'Feed-Wand',
    text: 'Noch voller Slop. Erst unter dem Bogen installieren.',
    en: 'Still full of slop. Install under the arch first.',
  },
  hoehle: {
    kicker: 'Station 7',
    title: 'Die Höhle',
    text: 'Hinter dem Wasserfall steht die Stele. E öffnet das Terminal mit README und Zahlen.',
    en: 'Behind the waterfall: the stele with the README and the numbers.',
  },
  langs: (line: string) => ({
    kicker: 'Fund',
    title: 'Sprachsäulen',
    text: line,
    en: 'One bamboo stalk per language at the bridge ends, height = share.',
  }),
  cairn: (release: string | null) =>
    release === null
      ? {
          kicker: 'Fund',
          title: 'Release-Steinmann',
          text: 'Noch kein Release.',
          en: 'No release yet.',
        }
      : {
          kicker: 'Fund',
          title: 'Release-Steinmann',
          text: `Letztes Release: ${release}`,
          en: `Latest release: ${release}`,
        },
  liana: {
    kicker: 'Fund',
    title: 'Liane',
    text: 'E zieht an der Liane und schüttelt die Glühwürmchen los.',
    en: 'Pull it to shake the fireflies loose.',
  },
} as const;

/** The station bar's chip labels, in the order the player walks them (spec §"Station bar"). */
export const STATION_NAMES: readonly [
  'Laterne',
  'Feed-Pfad',
  'Commit-Stufen',
  'Bogen',
  'Exponat',
  'Feed-Wand',
  'Höhle',
] = ['Laterne', 'Feed-Pfad', 'Commit-Stufen', 'Bogen', 'Exponat', 'Feed-Wand', 'Höhle'];

/** The short top-centre toasts, one per world event (spec §"Toasts"). */
export const TOASTS = {
  lantern: 'Die Laterne leuchtet auf',
  falls: 'Hinter dem Wasserfall',
  wallOff: 'Deslopify aus: der Slop wächst zurück',
  wallOn: 'Deslopify an: neuer Ring von der Wand',
  liana: 'Die Glühwürmchen stieben auf',
} as const;

/** The arrival pitch over the opening camera shot (spec §"Arrival camera (K2)"). */
export const PITCH = {
  title: 'Deslopify',
  line: 'YouTube ohne KI-Übersetzung · YouTube without AI translation',
} as const;

/** The banner over the install moment (spec §"Moment camera (K3)"). */
export const MOMENT_BANNER = 'Deslopify installiert · der Dschungel wird entslopt' as const;

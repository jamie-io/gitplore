/**
 * The canonical Deslopify content: the four feed cards, the four metadata tags, the badges,
 * the captions, the in-world prompts and the shared palette. Both string variants of every
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
  englishSummary:
    'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
  comparison: { without: FEED_CARDS[1].slop, with: FEED_CARDS[1].original },
} as const;

/** The world's in-world demo hint: the wall is what "try it in the world" leads to. */
export const DEMO_HINT = 'E an der Wand: Deslopify aus- und einschalten';

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

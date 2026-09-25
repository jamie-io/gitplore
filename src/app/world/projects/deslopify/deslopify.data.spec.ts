import {
  BADGE,
  CAPTION,
  FEED_CARDS,
  MOMENT_BANNER,
  PALETTE,
  PLATES,
  PROMPTS,
  SLOP_TAGS,
  STATION_NAMES,
  TOASTS,
} from './deslopify.data';

describe('Deslopify canonical data', () => {
  it('holds the four canonical feed cards verbatim', () => {
    expect(FEED_CARDS).toHaveLength(4);
    expect(FEED_CARDS).toEqual([
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
    ]);
  });

  it('holds the four canonical tags verbatim', () => {
    expect(SLOP_TAGS).toHaveLength(4);
    expect(SLOP_TAGS).toEqual([
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
    ]);
  });

  it('spells the translated and original badges and captions', () => {
    expect(BADGE).toEqual({
      translated: 'Automatisch übersetzt · Audio: Deutsch (KI)',
      original: 'Original · Englisch',
    });
    expect(CAPTION).toEqual({ translated: 'ÜBERSETZT · translated', original: 'ORIGINAL' });
  });

  it('spells every in-world prompt', () => {
    expect(PROMPTS).toEqual({
      wallOn: 'Deslopify einschalten',
      wallOff: 'Deslopify ausschalten',
      liana: 'Liane ziehen',
      steleEnter: 'Terminal bedienen',
      steleLeave: 'Terminal verlassen',
      exhibit: 'Details, README & Code',
      cave: 'Höhle betreten',
      lanternOn: 'Laterne anzünden',
      lanternOff: 'Laterne löschen',
    });
  });

  it('pins the palette the world and the cards share', () => {
    expect(PALETTE).toEqual({
      original: '#e0a13c',
      slop: '#9a3f8d',
      slopLine: 'oklch(0.68 0.19 335)',
      wood: '#5a3d27',
      stele: '#141b17',
      ink: '#f4efe4',
      engrave: '#f4e6c8',
    });
  });
});

describe('Lichtung copy', () => {
  it('names the seven stations in story order', () => {
    expect(STATION_NAMES).toEqual([
      'Laterne',
      'Feed-Pfad',
      'Commit-Stufen',
      'Bogen',
      'Exponat',
      'Feed-Wand',
      'Höhle',
    ]);
  });
  it('fills the commit count into the steps plate', () => {
    expect(PLATES.stufen(4).text).toBe(
      'Elf Stufen hinauf zum Bogen, eine pro Zeitabschnitt. Stufen mit Commits leuchten. Bisher 4 Commits.',
    );
    expect(PLATES.stufen(1).text).toContain('Bisher 1 Commit.');
  });
  it('says no release yet when there is none', () => {
    expect(PLATES.cairn(null)).toEqual({
      kicker: 'Fund',
      title: 'Release-Steinmann',
      text: 'Noch kein Release.',
      en: 'No release yet.',
    });
    expect(PLATES.cairn('v1.2.0').text).toBe('Letztes Release: v1.2.0');
  });
  it('keeps the portal, wall and moment strings verbatim', () => {
    expect(PLATES.portal.en).toBe(
      'A browser extension that brings back original YouTube titles, thumbnails and audio. Follow the lantern.',
    );
    expect(PLATES.wandOff.text).toBe('Noch voller Slop. Erst unter dem Bogen installieren.');
    expect(MOMENT_BANNER).toBe('Deslopify installiert · der Dschungel wird entslopt');
    expect(TOASTS.wallOn).toBe('Deslopify an: neuer Ring von der Wand');
  });
  it('keeps every plate text to two lines of German and one of English', () => {
    const plates = [
      PLATES.portal,
      PLATES.laterne,
      PLATES.pfad,
      PLATES.stufen(4),
      PLATES.bogen,
      PLATES.exponat,
      PLATES.wandOn,
      PLATES.wandOff,
      PLATES.hoehle,
      PLATES.liana,
    ];
    for (const plate of plates) {
      expect(plate.text.length).toBeLessThanOrEqual(130);
      expect(plate.en.length).toBeLessThanOrEqual(110);
    }
  });
});

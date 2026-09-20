/**
 * Every sound in the world, synthesised (T6). No files, no dependency: a footfall is band-passed
 * noise, the wind is two detuned oscillators under a slow breath, the water is a filter wandering
 * on a seeded walk, and a discovery is four notes of the place's own key.
 *
 * The per-world parameters all come from `WorldAudio`, which is the palette in `mood.ts` — the
 * same record the sky and the sun are cut from, so a world changes what it sounds like exactly
 * where it changes what it looks like.
 */
import type { WorldAudio } from './audio.service';
import { SynthGraph, seeded } from './synth-graph';

/** Seconds a footfall takes from contact to silence. */
const STEP_SECONDS = 0.22;

/** How much the trailing foot is detuned against the leading one, so a walk is not a metronome. */
const OFF_FOOT_DETUNE = 0.94;

/** The quietest and loudest a footfall gets, between standing still and a full run. */
const STEP_MIN_GAIN = 0.1;
const STEP_MAX_GAIN = 0.3;

/** Seconds between two steps of the water's random walk. */
const WATER_WALK_MS = 220;

/** How far the water's band-pass may wander from its centre, as a factor. */
const WATER_SPREAD = 0.45;

/** Breaths per second of the wind's LFO: one slow swell every fourteen seconds or so. */
const WIND_LFO_HZ = 0.07;

/** A perfect fifth, the interval the portal hums in. */
const FIFTH = 1.5;

/** The discovery arpeggio: root, major third, fifth, octave, an octave above the world's key. */
const ARPEGGIO = [1, 1.25, 1.5, 2];
const ARPEGGIO_STEP = 0.09;
const ARPEGGIO_NOTE_SECONDS = 0.26;

const SILENT = 0.0001;

/**
 * One footfall: the shared noise buffer through a band-pass whose centre is the surface underfoot
 * and whose Q is how much that surface rings. `strength` is 0 for a creep and 1 for a full run;
 * `foot` is 0 or 1, the two crossings of the stride phase, and only detunes the trailing one.
 */
export function footstep(
  graph: SynthGraph,
  world: WorldAudio,
  strength: number,
  foot: 0 | 1,
): void {
  const out = graph.takeVoice('world', STEP_SECONDS);
  if (!out) {
    return;
  }

  const now = graph.now;
  const level = STEP_MIN_GAIN + (STEP_MAX_GAIN - STEP_MIN_GAIN) * clamp01(strength);

  const filter = graph.context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = world.surface * (foot === 1 ? OFF_FOOT_DETUNE : 1);
  filter.Q.value = world.ring;
  filter.connect(out);

  const source = graph.context.createBufferSource();
  source.buffer = graph.noise;
  source.connect(filter);
  // A different two hundred milliseconds of the same noise each time, so no two steps are the
  // same sample; the clock is as good a cursor as any and costs nothing to keep.
  source.start(now, now % (graph.noise.duration - STEP_SECONDS), STEP_SECONDS);

  out.gain.setValueAtTime(SILENT, now);
  out.gain.linearRampToValueAtTime(level, now + 0.005);
  out.gain.exponentialRampToValueAtTime(SILENT, now + STEP_SECONDS);
}

/** A short confirmation for the interact key. The only sound that is not part of the world. */
export function blip(graph: SynthGraph, world: WorldAudio): void {
  const out = graph.takeVoice('ui', 0.14);
  if (!out) {
    return;
  }

  const now = graph.now;
  const osc = graph.context.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = world.key * 3;
  osc.connect(out);
  osc.start(now);
  osc.stop(now + 0.14);

  out.gain.setValueAtTime(SILENT, now);
  out.gain.linearRampToValueAtTime(0.12, now + 0.006);
  out.gain.exponentialRampToValueAtTime(SILENT, now + 0.14);
}

/** Four notes in the world's key, the first time the visitor walks up to something. */
export function arpeggio(graph: SynthGraph, world: WorldAudio): void {
  ARPEGGIO.forEach((ratio, index) => {
    const offset = index * ARPEGGIO_STEP;
    const out = graph.takeVoice('ui', offset + ARPEGGIO_NOTE_SECONDS);
    if (!out) {
      return;
    }

    const start = graph.now + offset;
    const osc = graph.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = world.key * 2 * ratio;
    osc.connect(out);
    osc.start(start);
    osc.stop(start + ARPEGGIO_NOTE_SECONDS);

    out.gain.setValueAtTime(SILENT, start);
    out.gain.linearRampToValueAtTime(0.1, start + 0.02);
    out.gain.exponentialRampToValueAtTime(SILENT, start + ARPEGGIO_NOTE_SECONDS);
  });
}

/**
 * The bed of air a place sits in: two detuned oscillators an octave below its key, plus low noise,
 * all breathing under one slow LFO. It is built once with the graph and retuned when the world
 * changes, so walking into a repository world crossfades the air instead of cutting it.
 */
export class WindBed {
  private readonly out: GainNode;
  private readonly depth: GainNode;
  private readonly noiseGain: GainNode;
  private readonly tone: GainNode;
  private readonly oscillators: OscillatorNode[];
  private readonly lfo: OscillatorNode;
  private readonly source: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;

  constructor(private readonly graph: SynthGraph) {
    const context = graph.context;
    this.out = context.createGain();
    this.out.gain.value = 0;
    this.out.connect(graph.busFor('ambience'));

    // The breath: an LFO scaled by `depth` added onto the bed's own gain.
    this.depth = context.createGain();
    this.depth.gain.value = 0;
    this.depth.connect(this.out.gain);
    this.lfo = context.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = WIND_LFO_HZ;
    this.lfo.connect(this.depth);
    this.lfo.start();

    this.tone = context.createGain();
    this.tone.gain.value = 0.25;
    this.tone.connect(this.out);
    this.oscillators = [0, 1].map((index) => {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.detune.value = index === 0 ? -7 : 9;
      osc.connect(this.tone);
      osc.start();
      return osc;
    });

    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 480;
    this.filter.Q.value = 0.7;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;
    this.filter.connect(this.noiseGain);
    this.noiseGain.connect(this.out);

    this.source = context.createBufferSource();
    this.source.buffer = graph.noise;
    this.source.loop = true;
    this.source.connect(this.filter);
    this.source.start();
  }

  /** Retunes the bed to a place: its key sets the pitch, its wind sets how much of it is air. */
  setWorld(world: WorldAudio): void {
    const level = 0.12 + 0.5 * clamp01(world.wind);
    this.graph.ramp(this.out.gain, level);
    this.graph.ramp(this.depth.gain, level * 0.45);
    this.graph.ramp(this.noiseGain.gain, 0.15 + 0.85 * clamp01(world.wind));
    this.graph.ramp(this.filter.frequency, 320 + 900 * clamp01(world.wind));
    this.oscillators.forEach((osc) => this.graph.ramp(osc.frequency, world.key / 2));
  }

  stop(): void {
    const now = this.graph.now;
    this.oscillators.forEach((osc) => osc.stop(now));
    this.lfo.stop(now);
    this.source.stop(now);
    [this.out, this.depth, this.tone, this.noiseGain, this.filter].forEach((node) =>
      node.disconnect(),
    );
  }
}

/**
 * Running water: the shared noise through a band-pass whose centre wanders on a seeded random
 * walk. The walk is stepped by a timer a few times a second — never per frame — and seeded, so
 * the pond sounds the same on every visit for the same reason it looks the same.
 */
export class WaterVoice {
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly source: AudioBufferSourceNode;
  private readonly random = seeded(0x77a7e2);
  private walk: ReturnType<typeof setInterval> | null = null;
  private centre = 900;
  private level = 0;

  constructor(private readonly graph: SynthGraph) {
    const context = graph.context;
    this.out = context.createGain();
    this.out.gain.value = 0;
    this.out.connect(graph.busFor('ambience'));

    this.filter = context.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = this.centre;
    this.filter.Q.value = 1.4;
    this.filter.connect(this.out);

    this.source = context.createBufferSource();
    this.source.buffer = graph.noise;
    this.source.loop = true;
    this.source.connect(this.filter);
    this.source.start();

    this.walk = setInterval(() => this.step(), WATER_WALK_MS);
  }

  /** A world with no water ramps to nothing, and its walk stands still: silence costs nothing. */
  setWorld(world: WorldAudio): void {
    this.level = clamp01(world.water);
    this.graph.ramp(this.out.gain, 0.5 * this.level);
  }

  stop(): void {
    if (this.walk !== null) {
      clearInterval(this.walk);
      this.walk = null;
    }
    this.source.stop(this.graph.now);
    this.out.disconnect();
    this.filter.disconnect();
  }

  /**
   * One step of the walk: a new centre within `WATER_SPREAD` of the last, eased into. Skipped
   * where there is no water to hear, and while the context is suspended — a muted tab would
   * otherwise pile automation events onto a clock that is not running.
   */
  private step(): void {
    if (this.level === 0 || this.graph.context.state !== 'running') {
      return;
    }

    const drift = (this.random() * 2 - 1) * WATER_SPREAD * 900;
    this.centre = clamp(this.centre + drift, 420, 2600);
    this.filter.frequency.setTargetAtTime(this.centre, this.graph.now, WATER_WALK_MS / 2000);
  }
}

/**
 * The hum of the thing the visitor has walked up to — a portal in the start world, the screen or
 * the way back in a repository world. Two oscillators a perfect fifth apart, whose level is
 * written straight onto the gain node as the player closes on it: a number on a node, never a
 * signal, so the render loop stays out of change detection.
 */
export class ProximityHum {
  private readonly out: GainNode;
  private readonly oscillators: OscillatorNode[];

  constructor(private readonly graph: SynthGraph) {
    const context = graph.context;
    this.out = context.createGain();
    this.out.gain.value = 0;
    this.out.connect(graph.busFor('world'));

    this.oscillators = [1, FIFTH].map((ratio, index) => {
      const osc = context.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = 220 * ratio;
      osc.connect(this.out);
      osc.start();
      return osc;
    });
  }

  setWorld(world: WorldAudio): void {
    this.oscillators.forEach((osc, index) =>
      this.graph.ramp(osc.frequency, world.key * (index === 0 ? 1 : FIFTH)),
    );
  }

  /** 0 … 1, already smoothed by the caller — this is the per-frame write the brief allows. */
  setLevel(level: number): void {
    this.out.gain.value = 0.16 * clamp01(level);
  }

  stop(): void {
    const now = this.graph.now;
    this.oscillators.forEach((osc) => osc.stop(now));
    this.out.disconnect();
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

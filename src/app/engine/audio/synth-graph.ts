/**
 * The WebAudio graph every sound in the world is played through (T6).
 *
 * Voices → three buses (`ambience`, `world`, `ui`) → master gain → `DynamicsCompressor` →
 * destination. The buses exist so the world can be ducked to a murmur without touching the
 * interface sounds, the master is where the visitor's volume lands, and the compressor is the
 * guarantee that eight voices at once never clip a stranger's speakers.
 *
 * It holds no Angular and no Three: it is a plain object over an `AudioContext`, which is what
 * lets a hand-written fake stand in for the device the test machine does not have.
 */

export type BusName = 'ambience' | 'world' | 'ui';

export const BUS_NAMES: readonly BusName[] = ['ambience', 'world', 'ui'];

/**
 * How loud each bus sits under the master. The ambience bed runs constantly, so it sits well
 * below the things that happen; the interface is quiet because it is only ever a confirmation.
 */
const BUS_LEVELS: Record<BusName, number> = { ambience: 0.5, world: 0.85, ui: 0.45 };

/** The buses a demo panel ducks. The interface keeps its level, or the world would go mute. */
const DUCKED_BUSES: readonly BusName[] = ['ambience', 'world'];

/** What a ducked bus drops to: present, but clearly behind whatever the panel is doing. */
export const DUCK_LEVEL = 0.15;

/**
 * Concurrent one-shots. Footsteps, blips and the notes of a discovery arpeggio all take a slot;
 * past eight nothing is added, because on the weakest tier a pile-up costs frames and, past about
 * this many, nobody can hear the difference anyway.
 */
export const MAX_VOICES = 8;

/** Seconds every gain change is eased over, so a volume, a duck or a mute never clicks. */
export const RAMP_SECONDS = 0.08;

/** Seconds of noise in the one buffer every noisy voice reuses. */
const NOISE_SECONDS = 2;

/** Fixed, so the wind, the water and every footfall sound the same on every visit. */
const NOISE_SEED = 0x5ee4;

/**
 * A tiny seeded generator. `@world` has `seededRandom` and `@engine` may not import it, so the
 * six lines are repeated here — the water's walk and the noise bed have to be the same on every
 * visit for the same reason a landmark may not move between them.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SynthGraph {
  readonly master: GainNode;
  readonly compressor: DynamicsCompressorNode;
  /** The one noise buffer every noisy voice plays: white, two seconds, looped or windowed. */
  readonly noise: AudioBuffer;

  private readonly buses: Record<BusName, GainNode>;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  private voices = 0;
  private volume = 0;
  private ducked = false;
  private disposed = false;

  constructor(readonly context: AudioContext) {
    this.compressor = context.createDynamicsCompressor();
    // A gentle limiter rather than a character compressor: it exists to catch the peak when a
    // footstep, a blip and an arpeggio land on the same frame.
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;
    this.compressor.connect(context.destination);

    this.master = context.createGain();
    // Silent until the visitor's volume is pushed in: nothing may sound before it is known.
    this.master.gain.value = 0;
    this.master.connect(this.compressor);

    this.buses = {
      ambience: this.bus('ambience'),
      world: this.bus('world'),
      ui: this.bus('ui'),
    };

    this.noise = createNoise(context, NOISE_SECONDS, NOISE_SEED);
  }

  get now(): number {
    return this.context.currentTime;
  }

  /** Where a continuous voice connects. One-shots go through `takeVoice` instead. */
  busFor(name: BusName): GainNode {
    return this.buses[name];
  }

  /** The visitor's volume, 0 … 1, straight onto the master gain. */
  setVolume(volume: number): void {
    this.volume = Math.min(Math.max(volume, 0), 1);
    this.ramp(this.master.gain, this.volume);
  }

  /** Drops the world and the ambience behind an open demo panel; the interface stays put. */
  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) {
      return;
    }
    this.ducked = ducked;
    for (const name of DUCKED_BUSES) {
      this.ramp(this.buses[name].gain, BUS_LEVELS[name] * (ducked ? DUCK_LEVEL : 1));
    }
  }

  /**
   * Reserves one of the pool's slots and hands back the gain node the one-shot plays into,
   * already connected to `bus`. `null` means eight one-shots are already sounding and this one is
   * simply not played — which is the whole point of a pool.
   *
   * The slot is given back by a timer rather than by `onended`, so a source that never fires the
   * event — or a fake context that fires nothing at all — cannot starve the pool.
   */
  takeVoice(bus: BusName, seconds: number): GainNode | null {
    if (this.disposed || this.voices >= MAX_VOICES) {
      return null;
    }

    this.voices++;
    const out = this.context.createGain();
    out.gain.value = 0;
    out.connect(this.buses[bus]);

    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        this.voices--;
        out.disconnect();
      },
      (seconds + RAMP_SECONDS) * 1000,
    );
    this.timers.add(timer);

    return out;
  }

  /** One-shots currently holding a slot; the pool's own measure, and what the spec reads. */
  get activeVoices(): number {
    return this.voices;
  }

  /** Eases a gain param to `value`; the one place a level is ever changed. */
  ramp(param: AudioParam, value: number): void {
    const now = this.now;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + RAMP_SECONDS);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.voices = 0;
    BUS_NAMES.forEach((name) => this.buses[name].disconnect());
    this.master.disconnect();
    this.compressor.disconnect();
  }

  private bus(name: BusName): GainNode {
    const gain = this.context.createGain();
    gain.gain.value = BUS_LEVELS[name];
    gain.connect(this.master);
    return gain;
  }
}

/** White noise, seeded, in one buffer — every noisy voice band-passes this same two seconds. */
function createNoise(context: AudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = seeded(seed);
  for (let i = 0; i < length; i++) {
    data[i] = random() * 2 - 1;
  }
  return buffer;
}

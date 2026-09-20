import { InjectionToken, Service, inject, signal } from '@angular/core';
import type { Interactable } from '../interaction/interactable';
import {
  RUN_MULTIPLIER,
  STRIDE_LENGTH,
  WALK_SPEED,
  type PlayerController,
} from '../player/player-controller';
import type { SynthGraph } from './synth-graph';
import type { ProximityHum, WaterVoice, WindBed } from './voices';

/**
 * What a place sounds like: the sound half of the palette in `mood.ts`, next to its sky, its sun
 * and its wind. It is declared here rather than there because `@engine` may not import `@world` —
 * the mood carries the record and the scene director pushes it in, exactly as the quality tier
 * travels from `@ui` into the engine.
 */
export interface WorldAudio {
  /** Band-pass centre of a footfall, in Hz: the surface underfoot. Soil is low, stone is high. */
  readonly surface: number;
  /** How narrowly that band rings: soft ground swallows a step, a tiled floor sings. */
  readonly ring: number;
  /** Loudness of the wind bed, 0 still … 1 a stiff breeze. */
  readonly wind: number;
  /** Loudness of running water, 0 none … 1 a waterfall in earshot. */
  readonly water: number;
  /** The tonic this place hums and arpeggiates in, in Hz. */
  readonly key: number;
}

/**
 * `idle` before the start gesture and after teardown, `unavailable` where the browser has no
 * WebAudio at all, `suspended` while the tab is hidden or the visitor has muted. Published by the
 * HUD as `data-audio`, which is all an end-to-end test can check: SwiftShader has no audio output.
 */
export type AudioState = 'idle' | 'running' | 'suspended' | 'unavailable';

export type AudioContextFactory = () => AudioContext | null;

const createAudioContext: AudioContextFactory = () => {
  try {
    return typeof AudioContext === 'undefined'
      ? null
      : new AudioContext({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
};

/** Indirection so the service can be driven by the fake context in unit tests (as §9 does for the renderer). */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<AudioContextFactory>(
  'AUDIO_CONTEXT_FACTORY',
  { providedIn: 'root', factory: () => createAudioContext },
);

const TAU = Math.PI * 2;

/** Radians of stride per second at a full run: what a footfall's strength is measured against. */
const RUN_PHASE_RATE = (WALK_SPEED * RUN_MULTIPLIER * TAU) / STRIDE_LENGTH;

/** Seconds the hum takes to follow the player; a raw per-frame write would zip. */
const HUM_SMOOTHING = 0.12;

/**
 * Which foot landed between two readings of `PlayerController.stridePhase`, or `null` for none.
 *
 * The phase only ever runs forward and is wrapped to `[0, 2π)`, so a reading smaller than the last
 * one has crossed 0 and anything else can only have crossed π. It is advanced by the ground the
 * player actually covers, so a wall stops it — which is why no movement check belongs here.
 */
export function footfall(previous: number, current: number): 0 | 1 | null {
  if (current === previous) {
    return null;
  }
  if (current < previous) {
    return 0;
  }
  return previous < Math.PI && current >= Math.PI ? 1 : null;
}

/**
 * Everything the world sounds like, and the one thing that owns an `AudioContext` (T6).
 *
 * It is deliberately a thin shell: the graph and the voices are `import()`ed inside `resume()`,
 * after the visitor's start gesture, so no audio code sits in the initial bundle and a visitor who
 * never starts the world never pays for it.
 */
@Service()
export class AudioService {
  private readonly createContext = inject(AUDIO_CONTEXT_FACTORY);

  /** The only signal this service writes, and only when the context changes state. */
  readonly state = signal<AudioState>('idle');

  private context: AudioContext | null = null;
  private graph: SynthGraph | null = null;
  private voices: typeof import('./voices') | null = null;
  private wind: WindBed | null = null;
  private water: WaterVoice | null = null;
  private hum: ProximityHum | null = null;

  private world: WorldAudio | null = null;
  /**
   * Starts silent: the visitor's stored volume is pushed in before the start gate can be clicked,
   * and a portfolio that blares at a stranger is worse than one that is briefly quiet.
   */
  private volume = 0;
  private muted = false;
  private hidden = false;
  private ducked = false;
  private starting = false;
  /** Mirrors `state() === 'running'` for the render loop, so no signal is read per frame. */
  private running = false;

  private nearby: Interactable | null = null;
  private humLevel = 0;
  /** Last reading of the player's stride phase; `null` until the first frame of a world. */
  private phase: number | null = null;
  /** Interactables already met in this world, so a discovery sounds once. */
  private readonly discovered = new Set<string>();
  private offVisibility: (() => void) | null = null;

  /**
   * Builds the context and the graph. Called from the start gate's button — a real user gesture,
   * which is what the gate is for and what the browser's autoplay policy requires.
   */
  async resume(): Promise<void> {
    if (this.graph || this.starting || this.state() === 'unavailable') {
      return;
    }

    this.starting = true;
    // Synchronously, still inside the click: a context built outside a gesture starts suspended.
    const context = (this.context ??= this.createContext());
    if (!context) {
      this.state.set('unavailable');
      this.starting = false;
      return;
    }

    try {
      const [{ SynthGraph }, voices] = await Promise.all([
        import('./synth-graph'),
        import('./voices'),
      ]);
      // Torn down while the chunk was loading.
      if (this.context !== context) {
        return;
      }

      const graph = new SynthGraph(context);
      this.graph = graph;
      this.voices = voices;
      this.wind = new voices.WindBed(graph);
      this.water = new voices.WaterVoice(graph);
      this.hum = new voices.ProximityHum(graph);
      graph.setVolume(this.volume);
      graph.setDucked(this.ducked);
      this.applyWorld();
      this.watchVisibility();
      await this.applyState();
    } catch {
      // No graph, no sound: the world is still perfectly playable without it.
      this.dispose();
      this.state.set('unavailable');
    } finally {
      this.starting = false;
    }
  }

  /** The place the visitor now stands in; its sounds are retuned rather than rebuilt. */
  setWorld(world: WorldAudio): void {
    this.world = world;
    this.discovered.clear();
    this.nearby = null;
    this.humLevel = 0;
    this.phase = null;
    this.applyWorld();
  }

  /** The stored volume, 0 … 1, pushed in from `SettingsStore` the way the quality tier is. */
  setVolume(volume: number): void {
    this.volume = volume;
    this.graph?.setVolume(volume);
  }

  /** Muting suspends the context outright, so a silent visitor pays nothing for the graph. */
  setMuted(muted: boolean): void {
    if (muted === this.muted) {
      return;
    }
    this.muted = muted;
    void this.applyState();
  }

  /** Drops the world behind an open panel, where an embedded demo may be making its own noise. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.graph?.setDucked(ducked);
  }

  /**
   * What the player has walked up to, straight from `InteractionSystem.onChange` — which already
   * fires only on change. Meeting something for the first time in this world is a discovery.
   */
  setNearby(nearby: Interactable | null): void {
    this.nearby = nearby;
    if (!nearby || !this.running || !this.graph || !this.world) {
      return;
    }
    if (!this.discovered.has(nearby.id)) {
      this.discovered.add(nearby.id);
      this.voices?.arpeggio(this.graph, this.world);
    }
  }

  /** The interact key was used on something. */
  interact(): void {
    if (this.running && this.graph && this.world) {
      this.voices?.blip(this.graph, this.world);
    }
  }

  /**
   * Driven by the render loop as a tickable. Allocation-free, and it writes no signal: a footfall
   * is scheduled on the audio clock and the hum's level goes straight onto its gain node.
   */
  frame(dt: number, player: PlayerController): void {
    const graph = this.graph;
    const world = this.world;
    if (!graph || !world || !this.running) {
      return;
    }

    const previous = this.phase;
    const current = player.stridePhase;
    this.phase = current;
    if (previous !== null && dt > 0) {
      const foot = footfall(previous, current);
      if (foot !== null) {
        const rate = ((current - previous + TAU) % TAU) / dt;
        this.voices?.footstep(graph, world, rate / RUN_PHASE_RATE, foot);
      }
    }

    const target = this.nearby ? proximity(this.nearby, player) : 0;
    this.humLevel += (target - this.humLevel) * Math.min(1, dt / HUM_SMOOTHING);
    this.hum?.setLevel(this.humLevel);
  }

  /** Page teardown: the service is a root singleton, so the context has to go with the page. */
  dispose(): void {
    this.offVisibility?.();
    this.offVisibility = null;
    this.wind?.stop();
    this.water?.stop();
    this.hum?.stop();
    this.wind = null;
    this.water = null;
    this.hum = null;
    this.graph?.dispose();
    this.graph = null;
    this.voices = null;
    const context = this.context;
    this.context = null;
    void context?.close().catch(() => undefined);
    this.discovered.clear();
    this.nearby = null;
    this.humLevel = 0;
    this.phase = null;
    this.running = false;
    this.state.set('idle');
  }

  private applyWorld(): void {
    const world = this.world;
    if (!world) {
      return;
    }
    this.wind?.setWorld(world);
    this.water?.setWorld(world);
    this.hum?.setWorld(world);
  }

  /** Suspended whenever the tab is hidden or the visitor has muted; running otherwise. */
  private async applyState(): Promise<void> {
    const context = this.context;
    if (!context || !this.graph) {
      return;
    }

    try {
      await (this.muted || this.hidden ? context.suspend() : context.resume());
    } catch {
      // A context the browser refuses to start is simply not heard; the state below says so.
    }
    this.running = context.state === 'running';
    this.state.set(this.running ? 'running' : 'suspended');
  }

  private watchVisibility(): void {
    if (this.offVisibility || typeof document === 'undefined') {
      return;
    }

    const onChange = () => {
      this.hidden = document.hidden;
      void this.applyState();
    };
    document.addEventListener('visibilitychange', onChange);
    this.offVisibility = () => document.removeEventListener('visibilitychange', onChange);
  }
}

/** 1 at the centre of an interactable, 0 at the edge of the radius that made it nearby. */
function proximity(nearby: Interactable, player: PlayerController): number {
  const distance = Math.hypot(
    nearby.position.x - player.position.x,
    nearby.position.z - player.position.z,
  );
  return Math.min(Math.max(1 - distance / nearby.radius, 0), 1);
}

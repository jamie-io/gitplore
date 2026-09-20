import {
  FakeAudioContext,
  FakeAudioNode,
  FakeBiquadFilterNode,
  FakeBufferSourceNode,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
} from '../testing/fake-audio-context';
import type { WorldAudio } from './audio.service';
import { MAX_VOICES, SynthGraph } from './synth-graph';
import { ProximityHum, WaterVoice, WindBed, arpeggio, blip, footstep } from './voices';

const MEADOW: WorldAudio = { surface: 380, ring: 1, wind: 0.6, water: 0.3, key: 220 };
const GALLERY: WorldAudio = { surface: 1700, ring: 6, wind: 0, water: 0, key: 147 };

function build(): { fake: FakeAudioContext; graph: SynthGraph } {
  const fake = new FakeAudioContext();
  // Voices only ever exist on a context the start gesture has already started.
  fake.state = 'running';
  return { fake, graph: new SynthGraph(asAudioContext(fake)) };
}

/**
 * Remembers where the context's log stands; calling the result gives back everything built since,
 * which is how one voice's nodes are told apart from the graph's own.
 */
function mark(fake: FakeAudioContext): () => FakeAudioNode[] {
  const from = fake.created.length;
  return () => fake.created.slice(from);
}

const only = <T extends FakeAudioNode>(nodes: FakeAudioNode[], kind: string): T[] =>
  nodes.filter((node) => node.kind === kind) as T[];

describe('footstep', () => {
  it('band-passes the shared noise at the surface underfoot', () => {
    const { fake, graph } = build();
    const since = mark(fake);

    footstep(graph, MEADOW, 1, 0);

    const [filter] = only<FakeBiquadFilterNode>(since(), 'filter');
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.value).toBe(MEADOW.surface);
    expect(filter.Q.value).toBe(MEADOW.ring);

    const [source] = only<FakeBufferSourceNode>(since(), 'bufferSource');
    expect(source.buffer).toBe(graph.noise);
    expect(source.outputs).toEqual([filter]);
  });

  it('plays into the world bus, not the interface', () => {
    const { fake, graph } = build();
    const since = mark(fake);

    footstep(graph, MEADOW, 1, 0);

    const [out] = only<FakeGainNode>(since(), 'gain');
    expect(out.outputs).toEqual([graph.busFor('world')]);
  });

  it('detunes the trailing foot, so a walk is not a metronome', () => {
    const { fake, graph } = build();

    const frequencyOf = (foot: 0 | 1) => {
      const since = mark(fake);
      footstep(graph, MEADOW, 1, foot);
      return only<FakeBiquadFilterNode>(since(), 'filter')[0].frequency.value;
    };

    expect(frequencyOf(1)).toBeLessThan(frequencyOf(0));
  });

  it('is louder at a run than at a creep', () => {
    const { fake, graph } = build();

    const peakOf = (strength: number) => {
      const since = mark(fake);
      footstep(graph, MEADOW, strength, 0);
      const [out] = only<FakeGainNode>(since(), 'gain');
      return Math.max(...out.gain.changes.map((change) => change.value));
    };

    expect(peakOf(1)).toBeGreaterThan(peakOf(0));
  });

  it('plays nothing at all once the pool is full', () => {
    const { fake, graph } = build();
    for (let i = 0; i < MAX_VOICES; i++) {
      graph.takeVoice('world', 1);
    }
    const since = mark(fake);

    footstep(graph, MEADOW, 1, 0);

    expect(since()).toEqual([]);
  });
});

describe('blip', () => {
  it('is a short note on the interface bus, in the world’s key', () => {
    const { fake, graph } = build();
    const since = mark(fake);

    blip(graph, MEADOW);

    const [osc] = only<FakeOscillatorNode>(since(), 'oscillator');
    const [out] = only<FakeGainNode>(since(), 'gain');
    expect(osc.frequency.value).toBe(MEADOW.key * 3);
    expect(osc.stopped).toBeGreaterThan(osc.started ?? 0);
    expect(out.outputs).toEqual([graph.busFor('ui')]);
  });
});

describe('arpeggio', () => {
  it('sounds four notes of the world’s key, each after the last', () => {
    const { fake, graph } = build();
    const since = mark(fake);

    arpeggio(graph, MEADOW);

    const oscillators = only<FakeOscillatorNode>(since(), 'oscillator');
    expect(oscillators.map((osc) => osc.frequency.value)).toEqual([
      MEADOW.key * 2,
      MEADOW.key * 2.5,
      MEADOW.key * 3,
      MEADOW.key * 4,
    ]);
    const starts = oscillators.map((osc) => osc.started ?? 0);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(4);
  });

  it('plays what the pool has room for and drops the rest', () => {
    const { fake, graph } = build();
    for (let i = 0; i < MAX_VOICES - 2; i++) {
      graph.takeVoice('ui', 1);
    }
    const since = mark(fake);

    arpeggio(graph, MEADOW);

    expect(only(since(), 'oscillator')).toHaveLength(2);
  });
});

describe('ProximityHum', () => {
  it('is two oscillators a perfect fifth apart, in the world’s key', () => {
    const { fake, graph } = build();
    const since = mark(fake);

    const hum = new ProximityHum(graph);
    hum.setWorld(MEADOW);

    const [root, fifth] = only<FakeOscillatorNode>(since(), 'oscillator');
    expect(root.frequency.value).toBeCloseTo(MEADOW.key, 6);
    expect(fifth.frequency.value).toBeCloseTo(MEADOW.key * 1.5, 6);
    hum.stop();
  });

  it('writes the proximity level straight onto its gain, scheduling nothing', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const hum = new ProximityHum(graph);
    const [out] = only<FakeGainNode>(since(), 'gain');

    hum.setLevel(1);
    const loud = out.gain.value;
    hum.setLevel(0);

    expect(loud).toBeGreaterThan(0);
    expect(out.gain.value).toBe(0);
    expect(out.gain.changes).toEqual([]);
    expect(out.outputs).toEqual([graph.busFor('world')]);
    hum.stop();
  });

  it('stops its oscillators and lets go of the bus', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const hum = new ProximityHum(graph);

    hum.stop();

    expect(
      only<FakeOscillatorNode>(since(), 'oscillator').every((osc) => osc.stopped !== null),
    ).toBe(true);
    expect(only<FakeGainNode>(since(), 'gain')[0].outputs).toEqual([]);
  });
});

describe('WindBed', () => {
  it('breathes: an LFO modulates the gain the bed plays through', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const bed = new WindBed(graph);

    const [out] = only<FakeGainNode>(since(), 'gain');
    const [lfo] = only<FakeOscillatorNode>(since(), 'oscillator');
    expect(lfo.frequency.value).toBeLessThan(1);
    expect(lfo.outputs[0]).toBeInstanceOf(FakeGainNode);
    expect((lfo.outputs[0] as FakeGainNode).modulated).toContain(out.gain);
    expect(out.outputs).toEqual([graph.busFor('ambience')]);
    bed.stop();
  });

  it('is louder in a place with wind than in one without', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const bed = new WindBed(graph);
    const [out] = only<FakeGainNode>(since(), 'gain');

    bed.setWorld(GALLERY);
    const still = out.gain.value;
    bed.setWorld(MEADOW);

    expect(out.gain.value).toBeGreaterThan(still);
    bed.stop();
  });

  it('pitches its pad an octave below the world’s key', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const bed = new WindBed(graph);

    bed.setWorld(MEADOW);

    const [, first, second] = only<FakeOscillatorNode>(since(), 'oscillator');
    expect(first.frequency.value).toBeCloseTo(MEADOW.key / 2, 6);
    expect(second.frequency.value).toBeCloseTo(MEADOW.key / 2, 6);
    expect(first.detune.value).not.toBe(second.detune.value);
    bed.stop();
  });
});

describe('WaterVoice', () => {
  it('does not even walk where there is no water to hear', () => {
    vi.useFakeTimers();
    try {
      const { fake, graph } = build();
      const since = mark(fake);
      const water = new WaterVoice(graph);
      const [filter] = only<FakeBiquadFilterNode>(since(), 'filter');
      water.setWorld(GALLERY);

      vi.advanceTimersByTime(2000);

      expect(filter.frequency.changes).toEqual([]);
      water.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is silent in a world with no water', () => {
    const { fake, graph } = build();
    const since = mark(fake);
    const water = new WaterVoice(graph);
    const [out] = only<FakeGainNode>(since(), 'gain');

    water.setWorld(GALLERY);

    expect(out.gain.value).toBe(0);
    water.stop();
  });

  it('wanders its band-pass on a seeded walk, the same walk on every visit', () => {
    vi.useFakeTimers();
    try {
      const walk = () => {
        const { fake, graph } = build();
        const since = mark(fake);
        const water = new WaterVoice(graph);
        water.setWorld(MEADOW);
        const [filter] = only<FakeBiquadFilterNode>(since(), 'filter');
        const start = filter.frequency.value;

        vi.advanceTimersByTime(2000);
        const visited = filter.frequency.changes.map((change) => change.value);
        water.stop();
        return { start, visited };
      };

      const first = walk();
      const second = walk();

      expect(first.visited.length).toBeGreaterThan(4);
      expect(first.visited[0]).not.toBe(first.start);
      expect(first.visited).toEqual(second.visited);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops walking once it is stopped', () => {
    vi.useFakeTimers();
    try {
      const { graph } = build();
      const water = new WaterVoice(graph);

      water.stop();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

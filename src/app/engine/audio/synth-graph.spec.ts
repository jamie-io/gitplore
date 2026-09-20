import { FakeAudioContext, FakeGainNode, asAudioContext } from '../testing/fake-audio-context';
import { BUS_NAMES, DUCK_LEVEL, MAX_VOICES, SynthGraph, seeded } from './synth-graph';

/**
 * WebAudio produces no sound in jsdom and none under SwiftShader either, so the graph is checked
 * by what it builds and what it connects, against a fake context that records both.
 */
function build(): { fake: FakeAudioContext; graph: SynthGraph } {
  const fake = new FakeAudioContext();
  return { fake, graph: new SynthGraph(asAudioContext(fake)) };
}

/** The gain node a bus is, as the fake recorded it. */
function busNode(graph: SynthGraph, name: (typeof BUS_NAMES)[number]): FakeGainNode {
  return graph.busFor(name) as unknown as FakeGainNode;
}

describe('SynthGraph', () => {
  it('routes every bus through the master gain and the compressor to the destination', () => {
    const { fake, graph } = build();

    for (const name of BUS_NAMES) {
      const bus = busNode(graph, name);
      expect(bus.outputs).toEqual([graph.master]);
    }
    expect((graph.master as unknown as FakeGainNode).outputs).toEqual([graph.compressor]);
    expect(graph.compressor as unknown as FakeGainNode).toBeDefined();
    expect((graph.compressor as unknown as FakeGainNode).outputs).toEqual([fake.destination]);
  });

  it('starts silent, so nothing can sound before the visitor’s volume is known', () => {
    const { graph } = build();

    expect((graph.master as unknown as FakeGainNode).gain.value).toBe(0);
  });

  it('ramps the master to the volume it is given instead of jumping to it', () => {
    const { graph } = build();

    graph.setVolume(0.35);

    const gain = (graph.master as unknown as FakeGainNode).gain;
    expect(gain.value).toBeCloseTo(0.35, 6);
    expect(gain.changes.map((change) => change.method)).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
      'linearRampToValueAtTime',
    ]);
  });

  it('clamps a volume outside 0 … 1', () => {
    const { graph } = build();

    graph.setVolume(4);
    expect((graph.master as unknown as FakeGainNode).gain.value).toBe(1);

    graph.setVolume(-1);
    expect((graph.master as unknown as FakeGainNode).gain.value).toBe(0);
  });

  it('ducks the ambience and the world but never the interface', () => {
    const { graph } = build();
    const before = BUS_NAMES.map((name) => busNode(graph, name).gain.value);

    graph.setDucked(true);

    const [ambience, world, ui] = BUS_NAMES.map((name) => busNode(graph, name).gain.value);
    expect(ambience).toBeCloseTo(before[0] * DUCK_LEVEL, 6);
    expect(world).toBeCloseTo(before[1] * DUCK_LEVEL, 6);
    expect(ui).toBe(before[2]);
  });

  it('gives the ducked buses their level back', () => {
    const { graph } = build();
    const before = BUS_NAMES.map((name) => busNode(graph, name).gain.value);

    graph.setDucked(true);
    graph.setDucked(false);

    expect(BUS_NAMES.map((name) => busNode(graph, name).gain.value)).toEqual(before);
  });

  describe('the voice pool', () => {
    it('connects a one-shot to the bus it asked for', () => {
      const { graph } = build();

      const out = graph.takeVoice('ui', 0.2) as unknown as FakeGainNode;

      expect(out.outputs).toEqual([graph.busFor('ui')]);
      expect(out.gain.value).toBe(0);
    });

    it('refuses a ninth concurrent one-shot', () => {
      const { graph } = build();

      for (let i = 0; i < MAX_VOICES; i++) {
        expect(graph.takeVoice('world', 1)).not.toBeNull();
      }

      expect(graph.takeVoice('world', 1)).toBeNull();
      expect(graph.activeVoices).toBe(MAX_VOICES);
    });

    it('frees a slot once the one-shot has run its length', () => {
      vi.useFakeTimers();
      try {
        const { graph } = build();
        for (let i = 0; i < MAX_VOICES; i++) {
          graph.takeVoice('world', 0.2);
        }
        expect(graph.takeVoice('world', 0.2)).toBeNull();

        vi.advanceTimersByTime(400);

        expect(graph.activeVoices).toBe(0);
        expect(graph.takeVoice('world', 0.2)).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('disconnects a one-shot when its slot is freed', () => {
      vi.useFakeTimers();
      try {
        const { graph } = build();
        const out = graph.takeVoice('world', 0.2) as unknown as FakeGainNode;

        vi.advanceTimersByTime(400);

        expect(out.outputs).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('hands out nothing once the graph is disposed', () => {
      const { graph } = build();
      graph.dispose();

      expect(graph.takeVoice('ui', 0.2)).toBeNull();
    });
  });

  it('disconnects the whole chain on dispose', () => {
    const { graph } = build();
    const nodes = [
      ...BUS_NAMES.map((name) => busNode(graph, name)),
      graph.master as unknown as FakeGainNode,
      graph.compressor as unknown as FakeGainNode,
    ];

    graph.dispose();

    expect(nodes.every((node) => node.outputs.length === 0)).toBe(true);
  });

  it('drops the pending release timers on dispose, so nothing fires into a dead graph', () => {
    vi.useFakeTimers();
    try {
      const { graph } = build();
      graph.takeVoice('world', 0.2);

      graph.dispose();
      vi.advanceTimersByTime(400);

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fills one noise buffer the voices share, the same one on every visit', () => {
    const first = build().graph;
    const second = build().graph;

    expect(first.noise.duration).toBeCloseTo(2, 6);
    expect(first.noise.getChannelData(0)[0]).toBe(second.noise.getChannelData(0)[0]);
    expect(first.noise.getChannelData(0).some((sample) => sample !== 0)).toBe(true);
  });
});

describe('seeded', () => {
  it('repeats itself for the same seed and diverges for another', () => {
    const take = (seed: number) => Array.from({ length: 4 }, seeded(seed));

    expect(take(7)).toEqual(take(7));
    expect(take(7)).not.toEqual(take(8));
  });

  it('stays inside 0 … 1', () => {
    const random = seeded(3);

    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

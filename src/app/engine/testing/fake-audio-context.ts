/**
 * A hand-written `AudioContext` that builds nothing and plays nothing, but records every node it
 * created, every connection made between them and every write to an `AudioParam`.
 *
 * WebAudio is untestable in jsdom and inaudible under SwiftShader, so this is the only place the
 * synth graph can be checked at all: the specs assert the shape of the graph — buses, master,
 * compressor, the voice pool — rather than a sound nobody can hear (T6 brief, "Testing without a
 * device").
 */

export type ParamMethod =
  | 'setValueAtTime'
  | 'linearRampToValueAtTime'
  | 'exponentialRampToValueAtTime'
  | 'setTargetAtTime'
  | 'cancelScheduledValues';

export interface ParamChange {
  readonly method: ParamMethod;
  readonly value: number;
  readonly time: number;
}

/** Records writes and keeps `value` at whatever was last asked for, which is all the specs read. */
export class FakeAudioParam {
  readonly changes: ParamChange[] = [];

  constructor(public value = 0) {}

  setValueAtTime(value: number, time: number): this {
    return this.record('setValueAtTime', value, time);
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.record('linearRampToValueAtTime', value, time);
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    return this.record('exponentialRampToValueAtTime', value, time);
  }

  setTargetAtTime(value: number, time: number): this {
    return this.record('setTargetAtTime', value, time);
  }

  cancelScheduledValues(time: number): this {
    this.changes.push({ method: 'cancelScheduledValues', value: this.value, time });
    return this;
  }

  private record(method: ParamMethod, value: number, time: number): this {
    this.value = value;
    this.changes.push({ method, value, time });
    return this;
  }
}

export class FakeAudioNode {
  /** Everything `connect` was called with, in order — nodes and modulated params alike. */
  readonly outputs: (FakeAudioNode | FakeAudioParam)[] = [];
  disconnects = 0;

  constructor(readonly kind: string) {}

  connect<T extends FakeAudioNode | FakeAudioParam>(target: T): T {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.outputs.length = 0;
    this.disconnects++;
  }

  /** Whether a signal can reach `target` by following connections from here. */
  reaches(target: FakeAudioNode): boolean {
    return this.outputs.some(
      (node) => node instanceof FakeAudioNode && (node === target || node.reaches(target)),
    );
  }

  /** The params this node modulates, e.g. the gain an LFO breathes on. */
  get modulated(): FakeAudioParam[] {
    return this.outputs.filter((node): node is FakeAudioParam => node instanceof FakeAudioParam);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);

  constructor() {
    super('gain');
  }
}

export class FakeOscillatorNode extends FakeAudioNode {
  type = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  started: number | null = null;
  stopped: number | null = null;

  constructor() {
    super('oscillator');
  }

  start(time = 0): void {
    this.started = time;
  }

  stop(time = 0): void {
    this.stopped = time;
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);

  constructor() {
    super('filter');
  }
}

export class FakeAudioBuffer {
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(index: number): Float32Array {
    return this.channels[index];
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeAudioParam(1);
  started: number | null = null;
  stopped: number | null = null;

  constructor() {
    super('bufferSource');
  }

  start(time = 0): void {
    this.started = time;
  }

  stop(time = 0): void {
    this.stopped = time;
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);

  constructor() {
    super('compressor');
  }
}

export class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = new FakeAudioNode('destination');

  /** Every node this context ever made, in creation order. */
  readonly created: FakeAudioNode[] = [];

  resumes = 0;
  suspends = 0;
  closes = 0;

  createGain(): FakeGainNode {
    return this.track(new FakeGainNode());
  }

  createOscillator(): FakeOscillatorNode {
    return this.track(new FakeOscillatorNode());
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return this.track(new FakeBiquadFilterNode());
  }

  createBufferSource(): FakeBufferSourceNode {
    return this.track(new FakeBufferSourceNode());
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return this.track(new FakeDynamicsCompressorNode());
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }

  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closes++;
    this.state = 'closed';
    return Promise.resolve();
  }

  /** The nodes of one kind, e.g. every oscillator a voice built. */
  nodesOfKind(kind: string): FakeAudioNode[] {
    return this.created.filter((node) => node.kind === kind);
  }

  private track<T extends FakeAudioNode>(node: T): T {
    this.created.push(node);
    return node;
  }
}

/**
 * The cast every spec needs: production code is typed against the real DOM interfaces, and the
 * fake implements only the slice of them the synth graph touches.
 */
export function asAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}

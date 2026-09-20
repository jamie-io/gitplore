import { TestBed } from '@angular/core/testing';
import { Vector3 } from 'three';
import type { Interactable } from '../interaction/interactable';
import { PlayerController } from '../player/player-controller';
import {
  FakeAudioContext,
  FakeAudioNode,
  FakeGainNode,
  asAudioContext,
} from '../testing/fake-audio-context';
import { AUDIO_CONTEXT_FACTORY, AudioService, WorldAudio, footfall } from './audio.service';

const MEADOW: WorldAudio = { surface: 380, ring: 1, wind: 0.6, water: 0.3, key: 220 };
const PLAZA: WorldAudio = { surface: 1150, ring: 4.5, wind: 0.4, water: 0.45, key: 262 };

/** One tick of the event loop, for the state changes the service settles asynchronously. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function serviceWith(fake: FakeAudioContext | null): AudioService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AUDIO_CONTEXT_FACTORY,
        useValue: () => (fake ? asAudioContext(fake) : null),
      },
    ],
  });
  return TestBed.inject(AudioService);
}

/** The graph builds the compressor first and the master gain next, so this is the master. */
const masterGain = (fake: FakeAudioContext) => fake.nodesOfKind('gain')[0] as FakeGainNode;

function mark(fake: FakeAudioContext): () => FakeAudioNode[] {
  const from = fake.created.length;
  return () => fake.created.slice(from);
}

function interactable(id: string, x = 0, z = 0, radius = 4): Interactable {
  return { id, position: new Vector3(x, 0, z), radius, prompt: id, onInteract: () => undefined };
}

/** The tab visibility jsdom will not change on its own. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('footfall', () => {
  it('reports no foot while the phase stands still', () => {
    expect(footfall(1.2, 1.2)).toBeNull();
  });

  it('reports the leading foot when the phase wraps through 0', () => {
    expect(footfall(6.1, 0.2)).toBe(0);
  });

  it('reports the trailing foot when the phase crosses π', () => {
    expect(footfall(3.0, 3.3)).toBe(1);
  });

  it('reports nothing for a step that crosses neither', () => {
    expect(footfall(0.4, 0.9)).toBeNull();
    expect(footfall(4.0, 4.5)).toBeNull();
  });

  it('counts a step that lands exactly on π', () => {
    expect(footfall(3.1, Math.PI)).toBe(1);
  });
});

describe('AudioService', () => {
  let fake: FakeAudioContext;
  let audio: AudioService;

  beforeEach(() => {
    fake = new FakeAudioContext();
    audio = serviceWith(fake);
  });

  afterEach(() => {
    audio.dispose();
    setHidden(false);
  });

  it('is idle until the visitor has started the world', () => {
    expect(audio.state()).toBe('idle');
    expect(fake.created).toEqual([]);
  });

  it('reports itself unavailable where the browser has no WebAudio', async () => {
    const without = serviceWith(null);

    await without.resume();

    expect(without.state()).toBe('unavailable');
  });

  it('builds the graph on the start gesture and runs', async () => {
    await audio.resume();

    expect(audio.state()).toBe('running');
    expect(fake.state).toBe('running');
    expect(fake.nodesOfKind('compressor')).toHaveLength(1);
  });

  it('builds one context however often the gate is used', async () => {
    await audio.resume();
    const built = fake.created.length;

    await audio.resume();

    expect(fake.created).toHaveLength(built);
  });

  it('carries the volume pushed in before the gate onto the master', async () => {
    audio.setVolume(0.35);

    await audio.resume();

    expect(masterGain(fake).gain.value).toBeCloseTo(0.35, 6);
  });

  it('follows a volume changed while the world is running', async () => {
    await audio.resume();

    audio.setVolume(0.8);

    expect(masterGain(fake).gain.value).toBeCloseTo(0.8, 6);
  });

  it('suspends the context when the visitor mutes, and resumes when they do not', async () => {
    await audio.resume();

    audio.setMuted(true);
    await flush();
    expect(audio.state()).toBe('suspended');
    expect(fake.state).toBe('suspended');

    audio.setMuted(false);
    await flush();
    expect(audio.state()).toBe('running');
  });

  it('suspends while the tab is hidden and comes back with it', async () => {
    await audio.resume();

    setHidden(true);
    await flush();
    expect(audio.state()).toBe('suspended');

    setHidden(false);
    await flush();
    expect(audio.state()).toBe('running');
  });

  it('stays suspended when the tab comes back to a muted visitor', async () => {
    await audio.resume();
    audio.setMuted(true);
    await flush();

    setHidden(true);
    await flush();
    setHidden(false);
    await flush();

    expect(audio.state()).toBe('suspended');
  });

  it('fires one footstep when the stride phase crosses π', async () => {
    const player = new PlayerController();
    audio.setWorld(MEADOW);
    await audio.resume();

    player.stridePhase = 3.0;
    audio.frame(0.016, player);
    const since = mark(fake);
    player.stridePhase = 3.3;
    audio.frame(0.016, player);

    expect(since().filter((node) => node.kind === 'filter')).toHaveLength(1);
  });

  it('fires nothing while the player stands still', async () => {
    const player = new PlayerController();
    audio.setWorld(MEADOW);
    await audio.resume();

    player.stridePhase = 1.5;
    audio.frame(0.016, player);
    const since = mark(fake);
    audio.frame(0.016, player);
    audio.frame(0.016, player);

    expect(since()).toEqual([]);
  });

  it('never steps on the first frame of a world, whatever the phase already was', async () => {
    const player = new PlayerController();
    player.stridePhase = 4.2;
    audio.setWorld(MEADOW);
    await audio.resume();

    const since = mark(fake);
    audio.frame(0.016, player);

    expect(since()).toEqual([]);
  });

  it('stays silent while it is suspended', async () => {
    const player = new PlayerController();
    audio.setWorld(MEADOW);
    await audio.resume();
    audio.setMuted(true);
    await flush();

    player.stridePhase = 3.0;
    audio.frame(0.016, player);
    const since = mark(fake);
    player.stridePhase = 3.3;
    audio.frame(0.016, player);

    expect(since()).toEqual([]);
  });

  it('swells the hum as the player closes on what they are facing', async () => {
    const player = new PlayerController();
    audio.setWorld(MEADOW);
    await audio.resume();
    // The hum's gain is the last one the graph built while `resume` assembled the voices.
    const hum = fake.nodesOfKind('gain').filter((node) => node.outputs.length > 0);
    const humGain = hum[hum.length - 1] as FakeGainNode;

    audio.setNearby(interactable('portal', 0, -3.5));
    for (let i = 0; i < 40; i++) {
      audio.frame(0.016, player);
    }
    const far = humGain.gain.value;

    player.position.set(0, 1.7, -3.4);
    for (let i = 0; i < 40; i++) {
      audio.frame(0.016, player);
    }

    expect(humGain.gain.value).toBeGreaterThan(far);
  });

  it('sounds a discovery the first time something is met, and only the first time', async () => {
    audio.setWorld(MEADOW);
    await audio.resume();

    const first = mark(fake);
    audio.setNearby(interactable('portal'));
    expect(first().filter((node) => node.kind === 'oscillator').length).toBeGreaterThan(0);

    audio.setNearby(null);
    const again = mark(fake);
    audio.setNearby(interactable('portal'));

    expect(again()).toEqual([]);
  });

  it('forgets what was discovered when the world changes', async () => {
    audio.setWorld(MEADOW);
    await audio.resume();
    audio.setNearby(interactable('portal'));

    audio.setWorld(PLAZA);
    const since = mark(fake);
    audio.setNearby(interactable('portal'));

    expect(since().filter((node) => node.kind === 'oscillator').length).toBeGreaterThan(0);
  });

  it('blips when the interact key is used', async () => {
    audio.setWorld(MEADOW);
    await audio.resume();

    const since = mark(fake);
    audio.interact();

    expect(since().filter((node) => node.kind === 'oscillator')).toHaveLength(1);
  });

  it('makes no sound at all before the gate, however much happens', () => {
    const player = new PlayerController();
    audio.setWorld(MEADOW);

    audio.setNearby(interactable('portal'));
    audio.interact();
    player.stridePhase = 3.3;
    audio.frame(0.016, player);

    expect(fake.created).toEqual([]);
  });

  it('closes the context and goes back to idle on teardown', async () => {
    await audio.resume();

    audio.dispose();

    expect(fake.closes).toBe(1);
    expect(audio.state()).toBe('idle');
  });

  it('lets go of the visibility listener on teardown', async () => {
    await audio.resume();
    audio.dispose();

    setHidden(true);

    expect(audio.state()).toBe('idle');
  });
});

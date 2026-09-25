import { DeslopifyFlow, DeslopifyFlowOptions, FLOW, FlowLight, FlowPoint } from './deslopify.flow';

/** The flow prototype's metres per pixel. */
const MAP_SCALE = 0.18;

const POST: FlowPoint = { x: 0, z: 0 };
const ARCH: FlowPoint = { x: 0, z: -60 };
const WALL: FlowPoint = { x: 20, z: -90 };
/** Two cards on the south trail, two at the wall. */
const CARDS: readonly FlowPoint[] = [
  { x: 3, z: -10 },
  { x: -3, z: -30 },
  { x: 19, z: -90 },
  { x: 21, z: -90 },
];
const FAR: FlowPoint = { x: 500, z: 500 };

function flow(overrides: Partial<DeslopifyFlowOptions> = {}): DeslopifyFlow {
  return new DeslopifyFlow({
    lanternPost: POST,
    arch: ARCH,
    wall: WALL,
    cards: CARDS,
    underArch: (x, z) => Math.abs(x - ARCH.x) < 1.5 && z < ARCH.z + 1.6 && z > ARCH.z - 5,
    ...overrides,
  });
}

/** Steps the flow `seconds` long in `dt` slices with the player standing at `player`. */
function run(
  target: DeslopifyFlow,
  seconds: number,
  player: FlowPoint,
  light: FlowLight | null = null,
  dt = 1 / 60,
): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    target.update(dt, { player, light });
  }
}

describe('DeslopifyFlow', () => {
  it('converts the top-down map contract into metres', () => {
    expect(FLOW.ignitionRadius).toBe(2.2);
    expect(FLOW.ringSpeed).toBe(8);
    expect(FLOW.ringMax).toBeCloseTo(1400 * MAP_SCALE, 9);
    expect(FLOW.ringVisible).toBeCloseTo(1300 * MAP_SCALE, 9);
    expect(FLOW.hazeSpan).toBeCloseTo(700 * MAP_SCALE, 9);
    expect(FLOW.carryDelay).toBe(0.9);
  });

  it('starts in the slop: lantern unlit, nothing installed, full haze, every card translated', () => {
    const target = flow();

    expect(target.lantern).toBe('unlit');
    expect(target.lanternOn).toBe(false);
    expect(target.installed).toBe(false);
    expect(target.state).toBe('noch nicht');
    expect(target.haze).toBe(1);
    expect(target.ring.radius).toBe(0);
    expect(target.clearedCards).toBe(0);
    expect(target.statusLine).toBe('Deslopify noch nicht · Entslopt 0/4');
  });

  describe('the lantern', () => {
    it('stays unlit until the player comes within the ignition radius of its post', () => {
      const target = flow();

      run(target, 1, { x: FLOW.ignitionRadius + 0.05, z: 0 });
      expect(target.lantern).toBe('unlit');

      target.update(1 / 60, { player: { x: FLOW.ignitionRadius - 0.05, z: 0 }, light: null });
      expect(target.lantern).toBe('lit');
      expect(target.lanternOn).toBe(true);
    });

    it('is carried 0.9 s after it lights, and not before', () => {
      const target = flow();
      target.update(0, { player: POST, light: null });

      run(target, 0.85, POST);
      expect(target.lantern).toBe('lit');
      run(target, 0.1, POST);
      expect(target.lantern).toBe('carried');
    });

    it('lights from E before the player is close enough to light it by walking', () => {
      const target = flow();

      expect(target.igniteLantern()).toBe(true);
      expect(target.lantern).toBe('lit');
      expect(target.igniteLantern()).toBe(false);
    });

    it('toggles on and off only while carried', () => {
      const target = flow();
      expect(target.toggleLantern()).toBe(false);

      target.igniteLantern();
      expect(target.toggleLantern()).toBe(false);

      run(target, 1, FAR);
      expect(target.toggleLantern()).toBe(true);
      expect(target.lanternOn).toBe(false);
      expect(target.toggleLantern()).toBe(true);
      expect(target.lanternOn).toBe(true);
    });

    it('clears what lies inside its light, and only that', () => {
      const target = flow();
      const light: FlowLight = { x: 3, z: -10, radius: 5.5 };
      target.update(1 / 60, { player: FAR, light });

      expect(target.isCleared(3, -14)).toBe(true);
      expect(target.isCleared(3, -16)).toBe(false);

      target.update(1 / 60, { player: FAR, light: { ...light, radius: 0 } });
      expect(target.isCleared(3, -10)).toBe(false);
    });
  });

  describe('the arch', () => {
    it('installs Deslopify and starts the ring from the arch when the player walks under it', () => {
      const target = flow();

      target.update(1 / 60, { player: ARCH, light: null });

      expect(target.installed).toBe(true);
      expect(target.wallOn).toBe(true);
      expect(target.state).toBe('an');
      expect(target.ring.origin).toEqual(ARCH);
      // Crossing lights the lantern if the visitor walked past it in the dark.
      expect(target.lantern).not.toBe('unlit');
    });

    it('grows the ring at 8 m/s to its maximum and shows it only while under the cut-off', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });

      run(target, 2, FAR);
      expect(target.ring.radius).toBeCloseTo(16, 5);
      expect(target.ringVisible).toBe(true);
      expect(target.ringOpacity).toBeCloseTo(1 - 16 / FLOW.ringVisible, 5);

      run(target, 60, FAR);
      expect(target.ring.radius).toBe(FLOW.ringMax);
      expect(target.ringVisible).toBe(false);
      expect(target.ringOpacity).toBe(0);
    });

    it('eases the haze towards 1 − ring/126 m at dt·2', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });

      target.update(0.1, { player: FAR, light: null });
      // Ring 0.8 m: target 1 − 0.8/126; haze moves a fifth of the way there.
      const goal = 1 - 0.8 / FLOW.hazeSpan;
      expect(target.haze).toBeCloseTo(1 + (goal - 1) * 0.2, 9);

      run(target, 30, FAR);
      expect(target.haze).toBeLessThan(0.01);
    });

    it('clears everything inside the ring, globally', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });
      run(target, 1, FAR);

      expect(target.isCleared(ARCH.x + 7.9, ARCH.z)).toBe(true);
      expect(target.isCleared(ARCH.x + 8.1, ARCH.z)).toBe(false);
    });

    it('stays installed when the player walks back south: every card stays original', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });
      run(target, 40, FAR);
      expect(target.clearedCards).toBe(CARDS.length);

      // Back at the start of the trail, lantern out, for a long while.
      run(target, 30, { x: 0, z: 5 });

      expect(target.installed).toBe(true);
      expect(target.state).toBe('an');
      expect(target.clearedCards).toBe(CARDS.length);
      expect(target.haze).toBeLessThan(0.01);
      expect(target.statusLine).toBe('Deslopify an · Entslopt 4/4');
    });
  });

  describe('the cards', () => {
    it('wipe to the original at 2.2/s in the light and back at 1.1/s out of it', () => {
      const target = flow();
      const light: FlowLight = { x: 3, z: -10, radius: 5.5 };

      run(target, 0.2, FAR, light, 0.1);
      expect(target.cardWipe(0)).toBeCloseTo(0.44, 9);
      expect(target.cardOriginal(0)).toBe(false);
      run(target, 0.1, FAR, light, 0.1);
      expect(target.cardOriginal(0)).toBe(true);
      run(target, 1, FAR, light, 0.1);
      expect(target.cardWipe(0)).toBe(1);

      run(target, 0.2, FAR, null, 0.1);
      expect(target.cardWipe(0)).toBeCloseTo(0.78, 9);
      run(target, 2, FAR, null, 0.1);
      expect(target.cardWipe(0)).toBe(0);
      expect(target.cardWipe(1)).toBe(0);
    });
  });

  describe('the wall', () => {
    it('does nothing before Deslopify is installed', () => {
      const target = flow();

      expect(target.wallAvailable).toBe(false);
      expect(target.toggleWall()).toBe(false);
      expect(target.state).toBe('noch nicht');
      expect(target.installed).toBe(false);
    });

    it('switches off: the slop grows back everywhere and the haze returns', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });
      run(target, 40, FAR);

      expect(target.toggleWall()).toBe(true);
      expect(target.state).toBe('aus');
      expect(target.isCleared(ARCH.x, ARCH.z)).toBe(false);

      run(target, 5, FAR);
      expect(target.clearedCards).toBe(0);
      expect(target.haze).toBeGreaterThan(0.99);
      expect(target.statusLine).toBe('Deslopify aus · Entslopt 0/4');
    });

    it('switches on again with a new ring from the wall', () => {
      const target = flow();
      target.update(0, { player: ARCH, light: null });
      run(target, 40, FAR);
      target.toggleWall();
      run(target, 5, FAR);

      expect(target.toggleWall()).toBe(true);
      expect(target.state).toBe('an');
      expect(target.ring.origin).toEqual(WALL);
      expect(target.ring.radius).toBe(0);

      run(target, 0.5, FAR);
      // The wall's own cards, a metre from its centre, are inside the new ring already.
      expect(target.cardOriginal(2)).toBe(true);
      expect(target.cardOriginal(0)).toBe(false);
    });
  });

  describe('reduced motion', () => {
    it('jumps the ring, the haze and the cards straight to their end state', () => {
      let reduced = true;
      const target = flow({ reducedMotion: () => reduced });

      target.update(1 / 60, { player: ARCH, light: null });

      expect(target.ring.radius).toBe(FLOW.ringMax);
      expect(target.haze).toBe(0);
      expect(target.clearedCards).toBe(CARDS.length);
      reduced = false;
    });

    it('snaps a ring and a haze already in flight when it is switched on', () => {
      let reduced = false;
      const target = flow({ reducedMotion: () => reduced });
      target.update(0, { player: ARCH, light: null });
      run(target, 1, FAR);
      expect(target.ring.radius).toBeLessThan(FLOW.ringMax);
      expect(target.haze).toBeGreaterThan(0.5);

      reduced = true;
      target.update(1 / 60, { player: FAR, light: null });

      expect(target.ring.radius).toBe(FLOW.ringMax);
      expect(target.haze).toBe(0);
      expect(target.clearedCards).toBe(CARDS.length);
    });

    it('carries a lit lantern at once', () => {
      const target = flow({ reducedMotion: () => true });
      target.update(1 / 60, { player: POST, light: null });

      expect(target.lantern).toBe('carried');
    });
  });

  it('resets to the fresh state', () => {
    const target = flow();
    target.update(0, { player: ARCH, light: null });
    run(target, 40, FAR);
    target.toggleWall();

    target.reset();

    expect(target.lantern).toBe('unlit');
    expect(target.lanternOn).toBe(false);
    expect(target.installed).toBe(false);
    expect(target.wallOn).toBe(true);
    expect(target.ring).toEqual({ origin: ARCH, radius: 0 });
    expect(target.haze).toBe(1);
    expect(target.clearedCards).toBe(0);
    expect(target.isCleared(ARCH.x, ARCH.z)).toBe(false);
  });

  it('ignores negative and non-finite time steps', () => {
    const target = flow();
    target.update(0, { player: ARCH, light: null });

    target.update(-1, { player: FAR, light: null });
    target.update(Number.NaN, { player: FAR, light: null });

    expect(target.ring.radius).toBe(0);
    expect(target.haze).toBe(1);
  });
});

import {
  ARCH,
  BEHIND_FALLS,
  CARD_SLOTS,
  LANTERN_POST,
  PORTAL,
  STATION_STANDS,
  WALL,
  crossesArch,
  glidePath,
  stepCentres,
  underArch,
} from '../../environments/jungle-layout';
import { hazeMask } from '../../environments/shaders/ground-haze';
import { TOASTS } from './deslopify.data';
import {
  DeslopifyFlow,
  DeslopifyFlowOptions,
  FLOW,
  FlowLight,
  FlowPoint,
  clearance,
} from './deslopify.flow';

/** The wall's four cards, 1.3 m apart on its ledge, left to right. */
const WALL_CARDS: readonly FlowPoint[] = [0, 1, 2, 3].map((i) => ({
  x: WALL.x + (i - 1.5) * 1.3,
  z: WALL.z + 0.44,
}));
/** Off the walk on the east bank: near nothing that lights, installs or toasts. */
const FAR: FlowPoint = { x: 25, z: 18 };
const STEPS = stepCentres();

function flow(overrides: Partial<DeslopifyFlowOptions> = {}): DeslopifyFlow {
  return new DeslopifyFlow({
    lanternPost: LANTERN_POST,
    arch: ARCH,
    wall: WALL,
    cards: CARD_SLOTS,
    wallCards: WALL_CARDS,
    steps: STEPS,
    behindFalls: BEHIND_FALLS,
    underArch,
    crossesArch,
    glidePath,
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

/** Installs from the arch, then leaves the player far away. */
function installed(overrides: Partial<DeslopifyFlowOptions> = {}): DeslopifyFlow {
  const target = flow(overrides);
  target.update(0, { player: ARCH, light: null });
  target.update(0, { player: FAR, light: null });
  return target;
}

function distance(a: FlowPoint, b: FlowPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('DeslopifyFlow', () => {
  it('uses the Lichtung prototype’s constants, in metres', () => {
    expect(FLOW.ignitionRadius).toBe(2.6);
    expect(FLOW.carryDelay).toBe(0.9);
    expect(FLOW.lightRadius).toBe(8);
    expect(FLOW.lightCore).toBe(0.7);
    expect(FLOW.ringSpeed).toBe(17);
    expect(FLOW.ringShrink).toBe(24);
    expect(FLOW.ringMax).toBe(72);
    expect(FLOW.ringVisible).toBe(70);
    expect(FLOW.ringEdge).toBe(4);
    expect(FLOW.cardOn).toBe(2.2);
    expect(FLOW.cardOff).toBe(0.9);
    expect([0, 1, 2, 3].map(FLOW.wallOn)).toEqual([2.4, 2.4 - 0.35, 2.4 - 0.7, 2.4 - 0.35 * 3]);
    expect([0, 1, 2, 3].map(FLOW.wallOff)).toEqual([1.2, 1.2 + 0.2, 1.2 + 0.4, 1.2 + 0.2 * 3]);
    expect(FLOW.tagOn).toBe(2.6);
    expect(FLOW.tagOff).toBe(1.2);
    expect(FLOW.vineRetreat).toBe(3);
    expect(FLOW.vineRegrow).toBe(0.35);
    expect(FLOW.stepReach).toBe(2.4);
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
    expect(target.statusLine).toBe('Deslopify noch nicht · Entslopt 0/8');
  });

  describe('the clearance rule', () => {
    const light: FlowLight = { x: 0, z: 0, radius: 8 };

    it('clears fully inside 0.7 R of the lantern and fades to nothing at R', () => {
      expect(clearance(5.6, 0, light, null)).toBe(1);
      expect(clearance(6.8, 0, light, null)).toBeCloseTo(0.5, 9);
      expect(clearance(8, 0, light, null)).toBe(0);
      expect(clearance(9, 0, light, null)).toBe(0);
    });

    it('clears fully inside the ring and fades to nothing 4 m beyond it', () => {
      const ring = { origin: { x: 10, z: 0 }, radius: 20 };
      expect(clearance(30, 0, null, ring)).toBe(1);
      expect(clearance(32, 0, null, ring)).toBeCloseTo(0.5, 9);
      expect(clearance(34, 0, null, ring)).toBe(0);
    });

    it('takes whichever of the two clears more, and nothing without either', () => {
      const ring = { origin: { x: 20, z: 0 }, radius: 5 };
      expect(clearance(6.8, 0, light, ring)).toBeCloseTo(0.5, 9);
      // 1 m into the ring's 4 m fade: smoothstep, as the ground haze fades.
      expect(clearance(14, 0, light, ring)).toBeCloseTo(1 - 0.15625, 9);
      expect(clearance(0, 0, null, null)).toBe(0);
      expect(clearance(20, 0, null, { origin: { x: 20, z: 0 }, radius: 0 })).toBe(0);
    });

    it('is exactly the ground haze’s rule, so the haze clears with the cards, tags and vines', () => {
      const ring = { origin: { x: 2, z: -3 }, radius: 6 };
      const haze = {
        light: { x: light.x, z: light.z, radius: light.radius },
        ring: { x: ring.origin.x, z: ring.origin.z, radius: ring.radius },
      };
      // Near the bowl's middle, where its own soft edge leaves the haze whole.
      for (let x = -9; x <= 9; x += 0.75) {
        for (let z = -9; z <= 9; z += 0.75) {
          expect(clearance(x, z, light, ring)).toBeCloseTo(1 - hazeMask(x, z, haze), 9);
        }
      }
    });

    it('is what the flow reads for what is cleared', () => {
      const target = installed();
      run(target, 1, FAR);
      const r = target.ring.radius;

      expect(target.clearance(ARCH.x + r + 2, ARCH.z)).toBeCloseTo(0.5, 6);
      expect(target.isCleared(ARCH.x + r - 0.01, ARCH.z)).toBe(true);
      expect(target.isCleared(ARCH.x + r + 1, ARCH.z)).toBe(false);
    });
  });

  describe('the lantern', () => {
    it('lights at 2.5 m from its post and not at 2.7 m', () => {
      const target = flow();

      run(target, 1, { x: LANTERN_POST.x + 2.7, z: LANTERN_POST.z });
      expect(target.lantern).toBe('unlit');

      target.update(1 / 60, {
        player: { x: LANTERN_POST.x + 2.5, z: LANTERN_POST.z },
        light: null,
      });
      expect(target.lantern).toBe('lit');
      expect(target.lanternOn).toBe(true);
    });

    it('is carried 0.9 s after it lights, and not before', () => {
      const target = flow();
      target.update(0, { player: LANTERN_POST, light: null });

      run(target, 0.85, LANTERN_POST);
      expect(target.lantern).toBe('lit');
      run(target, 0.1, LANTERN_POST);
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

    it('clears what lies inside the core of its light, and only that', () => {
      const target = flow();
      const light: FlowLight = { x: 3, z: -10, radius: FLOW.lightRadius };
      target.update(1 / 60, { player: FAR, light });

      expect(target.isCleared(3, -10 - 5.5)).toBe(true);
      expect(target.isCleared(3, -10 - 5.7)).toBe(false);

      target.update(1 / 60, { player: FAR, light: { ...light, radius: 0 } });
      expect(target.isCleared(3, -10)).toBe(false);
    });
  });

  describe('the arch', () => {
    it('installs when the player stands under it, lighting a lantern left in the dark', () => {
      const target = flow();

      target.update(1 / 60, { player: ARCH, light: null });

      expect(target.installed).toBe(true);
      expect(target.wallOn).toBe(true);
      expect(target.state).toBe('an');
      expect(target.ring.origin).toEqual(ARCH);
      expect(target.lantern).not.toBe('unlit');
    });

    it('installs when one frame carries the player right through it', () => {
      const target = flow();
      target.update(1 / 60, { player: { x: 0, z: 3 }, light: null });
      expect(target.installed).toBe(false);

      target.update(1 / 60, { player: { x: 0, z: -3 }, light: null });

      expect(target.installed).toBe(true);
      expect(target.ring.origin).toEqual(ARCH);
    });

    it('installs when a jump (a glide’s teleport) takes the walk through the arch', () => {
      for (const from of [
        PORTAL,
        STATION_STANDS.laterne,
        STATION_STANDS.pfad,
        STATION_STANDS.stufen,
      ]) {
        for (const to of [STATION_STANDS.exponat, STATION_STANDS.wand, STATION_STANDS.hoehle]) {
          const onArchInstall = vi.fn();
          const target = flow({ onArchInstall });
          target.update(1 / 60, { player: from, light: null });

          target.update(1 / 60, { player: to, light: null });

          expect(target.installed, `${from.x}, ${from.z} → ${to.x}, ${to.z}`).toBe(true);
          expect(onArchInstall).toHaveBeenCalledTimes(1);
        }
      }
    });

    it('does not install for a jump that stays on one side of the arch', () => {
      const target = flow();
      target.update(1 / 60, { player: PORTAL, light: null });

      target.update(1 / 60, { player: STATION_STANDS.stufen, light: null });
      target.update(1 / 60, { player: STATION_STANDS.pfad, light: null });

      expect(target.installed).toBe(false);
    });

    it('does not count the jump of a reset as a crossing', () => {
      const target = flow();
      target.update(1 / 60, { player: { x: 0, z: 3 }, light: null });

      target.reset();
      target.update(1 / 60, { player: { x: 0, z: -3 }, light: null });

      expect(target.installed).toBe(false);
    });

    it('tells the scene once, for the install from the arch only', () => {
      const onArchInstall = vi.fn();
      const target = flow({ onArchInstall });

      target.update(1 / 60, { player: ARCH, light: null });
      run(target, 1, ARCH);
      expect(onArchInstall).toHaveBeenCalledTimes(1);

      target.toggleWall();
      target.toggleWall();
      expect(onArchInstall).toHaveBeenCalledTimes(1);

      target.reset();
      target.install(WALL);
      expect(onArchInstall).toHaveBeenCalledTimes(1);
      target.reset();
      target.update(1 / 60, { player: ARCH, light: null });
      expect(onArchInstall).toHaveBeenCalledTimes(2);
    });

    it('clears a boardwalk card once the ring passes it, distance / 17 s after the install', () => {
      const target = installed();
      const card = CARD_SLOTS[0];
      const seconds = distance(card, ARCH) / FLOW.ringSpeed;

      run(target, seconds - 0.05, FAR);
      expect(target.ring.radius).toBeLessThan(distance(card, ARCH));
      expect(target.isCleared(card.x, card.z)).toBe(false);
      expect(target.cardWipe(0)).toBe(0);

      run(target, 0.1, FAR);
      expect(target.ring.radius).toBeGreaterThan(distance(card, ARCH));
      expect(target.isCleared(card.x, card.z)).toBe(true);
      expect(target.cardWipe(0)).toBeGreaterThan(0);
    });

    it('grows the ring at 17 m/s, stops it at 72 m and shows it only under 70 m', () => {
      const target = installed();

      run(target, 2, FAR);
      expect(target.ring.radius).toBeCloseTo(34, 5);
      expect(target.ringVisible).toBe(true);
      expect(target.ringOpacity).toBeCloseTo(1 - 34 / 70, 5);

      run(target, 10, FAR);
      expect(target.ring.radius).toBe(72);
      expect(target.ringVisible).toBe(false);
      expect(target.ringOpacity).toBe(0);
    });

    it('lifts the haze as the ring covers the bowl', () => {
      const target = installed();

      run(target, 1, FAR);
      expect(target.haze).toBeLessThan(1);
      expect(target.haze).toBeGreaterThan(0.2);

      run(target, 20, FAR);
      expect(target.haze).toBeLessThan(0.01);
    });

    it('stays installed when the player walks back south: every card stays original', () => {
      const target = installed();
      run(target, 10, FAR);
      expect(target.clearedCards).toBe(8);

      run(target, 30, { x: 0, z: 20 });

      expect(target.installed).toBe(true);
      expect(target.state).toBe('an');
      expect(target.clearedCards).toBe(8);
      expect(target.haze).toBeLessThan(0.01);
      expect(target.statusLine).toBe('Deslopify an · Entslopt 8/8');
    });
  });

  describe('the cards', () => {
    it('wipe to the original at 2.2/s in the light and back at 0.9/s out of it', () => {
      const target = flow();
      const card = CARD_SLOTS[0];
      const light: FlowLight = { x: card.x, z: card.z, radius: FLOW.lightRadius };

      run(target, 0.2, FAR, light, 0.1);
      expect(target.cardWipe(0)).toBeCloseTo(0.44, 9);
      expect(target.cardOriginal(0)).toBe(false);
      run(target, 0.1, FAR, light, 0.1);
      expect(target.cardOriginal(0)).toBe(true);
      run(target, 1, FAR, light, 0.1);
      expect(target.cardWipe(0)).toBe(1);

      run(target, 0.2, FAR, null, 0.1);
      expect(target.cardWipe(0)).toBeCloseTo(0.82, 9);
      run(target, 2, FAR, null, 0.1);
      expect(target.cardWipe(0)).toBe(0);
    });

    it('starts the wall’s cards in the slop and keeps them there until the install', () => {
      const target = flow();
      const walk = [LANTERN_POST, CARD_SLOTS[1], CARD_SLOTS[3], { x: -2, z: 3.8 }];

      for (const at of walk) {
        run(target, 2, at, { x: at.x, z: at.z, radius: FLOW.lightRadius });
      }

      for (let i = 4; i < 8; i++) {
        expect(target.cardWipe(i)).toBe(0);
      }
      expect(target.installed).toBe(false);
    });

    it('turns the wall’s cards one after another: in at 2.4 − 0.35 i /s, out at 1.2 + 0.2 i /s', () => {
      const target = flow();
      const light: FlowLight = { x: WALL.x, z: WALL.z, radius: FLOW.lightRadius };

      run(target, 0.2, FAR, light, 0.1);
      [0, 1, 2, 3].forEach((i) =>
        expect(target.cardWipe(4 + i)).toBeCloseTo(0.2 * FLOW.wallOn(i), 9),
      );
      run(target, 2, FAR, light, 0.1);

      run(target, 0.2, FAR, null, 0.1);
      [0, 1, 2, 3].forEach((i) =>
        expect(target.cardWipe(4 + i)).toBeCloseTo(1 - 0.2 * FLOW.wallOff(i), 9),
      );
    });
  });

  describe('the steps', () => {
    it('light when the player comes within 2.4 m and stay lit until reset', () => {
      const target = flow();
      const step = STEPS[5];

      target.update(1 / 60, { player: { x: step.x + 2.5, z: step.z }, light: null });
      expect(target.stepLit(5)).toBe(false);

      target.update(1 / 60, { player: { x: step.x + 2.3, z: step.z }, light: null });
      expect(target.stepLit(5)).toBe(true);

      run(target, 5, FAR);
      expect(target.stepLit(5)).toBe(true);

      target.reset();
      expect(target.stepLit(5)).toBe(false);
    });
  });

  describe('toasts', () => {
    it('says the lantern lit once per ignition', () => {
      const onToast = vi.fn();
      const target = flow({ onToast });

      run(target, 2, LANTERN_POST);
      target.igniteLantern();
      expect(onToast.mock.calls).toEqual([[TOASTS.lantern]]);

      target.reset();
      target.igniteLantern();
      expect(onToast.mock.calls).toEqual([[TOASTS.lantern], [TOASTS.lantern]]);
    });

    it('says the visitor is behind the falls on entering, not again while inside', () => {
      const onToast = vi.fn();
      const target = flow({ onToast });
      const inside = { x: 0, z: (BEHIND_FALLS.z0 + BEHIND_FALLS.z1) / 2 };
      const falls = () => onToast.mock.calls.filter(([text]) => text === TOASTS.falls);

      run(target, 0.5, { x: 0, z: -17 });
      run(target, 2, inside);
      expect(falls()).toHaveLength(1);

      run(target, 0.5, { x: 0, z: -17 });
      run(target, 0.5, inside);
      expect(falls()).toHaveLength(2);
    });

    it('counts the whole cave as behind the falls, so leaving it says nothing', () => {
      const onToast = vi.fn();
      const target = flow({ onToast });
      const falls = () => onToast.mock.calls.filter(([text]) => text === TOASTS.falls);

      run(target, 0.5, { x: 0, z: -17 });
      run(target, 0.5, { x: 0, z: -19 });
      run(target, 0.5, { x: 0, z: -23 });
      run(target, 0.5, { x: 0, z: -19 });

      expect(falls()).toHaveLength(1);
    });

    it('says the visitor passed behind the falls when a jump takes the walk through them', () => {
      const onToast = vi.fn();
      const target = installed({ onToast });
      target.update(1 / 60, { player: STATION_STANDS.exponat, light: null });
      onToast.mockClear();

      target.update(1 / 60, { player: STATION_STANDS.hoehle, light: null });
      run(target, 1, STATION_STANDS.hoehle);

      expect(onToast.mock.calls).toEqual([[TOASTS.falls]]);
    });

    it('says it once for a jump that ends behind the falls', () => {
      const onToast = vi.fn();
      const target = installed({ onToast });
      target.update(1 / 60, { player: STATION_STANDS.wand, light: null });
      onToast.mockClear();

      run(target, 1, { x: 0, z: -19.6 });

      expect(onToast.mock.calls).toEqual([[TOASTS.falls]]);
    });

    it('says what the wall did', () => {
      const onToast = vi.fn();
      const target = installed({ onToast });
      onToast.mockClear();

      target.toggleWall();
      target.toggleWall();

      expect(onToast.mock.calls).toEqual([[TOASTS.wallOff], [TOASTS.wallOn]]);
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

    it('switches off: the ring shrinks back at 24 m/s and the slop grows back', () => {
      const target = installed();
      run(target, 10, FAR);

      expect(target.toggleWall()).toBe(true);
      expect(target.state).toBe('aus');
      run(target, 1, FAR);
      expect(target.ring.radius).toBeCloseTo(72 - 24, 5);
      expect(target.ringVisible).toBe(true);

      run(target, 5, FAR);
      expect(target.ring.radius).toBe(0);
      expect(target.isCleared(ARCH.x, ARCH.z)).toBe(false);
      expect(target.clearedCards).toBe(0);
      expect(target.haze).toBeGreaterThan(0.95);
      expect(target.statusLine).toBe('Deslopify aus · Entslopt 0/8');
    });

    it('switches on again with a new ring from the wall', () => {
      const target = installed();
      run(target, 10, FAR);
      target.toggleWall();
      run(target, 5, FAR);

      expect(target.toggleWall()).toBe(true);
      expect(target.state).toBe('an');
      expect(target.ring.origin).toEqual(WALL);
      expect(target.ring.radius).toBe(0);

      run(target, 0.5, FAR);
      // The wall's own cards, two metres from its centre, are inside the new ring already.
      expect(target.isCleared(WALL_CARDS[0].x, WALL_CARDS[0].z)).toBe(true);
      expect(target.isCleared(CARD_SLOTS[0].x, CARD_SLOTS[0].z)).toBe(false);
    });
  });

  describe('reduced motion', () => {
    it('jumps the ring, the haze and the cards straight to their end state', () => {
      const target = flow({ reducedMotion: () => true });

      target.update(1 / 60, { player: ARCH, light: null });

      expect(target.ring.radius).toBe(FLOW.ringMax);
      expect(target.haze).toBe(0);
      expect(target.clearedCards).toBe(8);

      target.toggleWall();
      target.update(1 / 60, { player: FAR, light: null });
      expect(target.ring.radius).toBe(0);
      expect(target.clearedCards).toBe(0);
    });

    it('snaps a ring and a haze already in flight when it is switched on', () => {
      let reduced = false;
      const target = installed({ reducedMotion: () => reduced });
      run(target, 1, FAR);
      expect(target.ring.radius).toBeLessThan(FLOW.ringMax);
      expect(target.haze).toBeGreaterThan(0.5);

      reduced = true;
      target.update(1 / 60, { player: FAR, light: null });

      expect(target.ring.radius).toBe(FLOW.ringMax);
      expect(target.haze).toBe(0);
      expect(target.clearedCards).toBe(8);
    });

    it('carries a lit lantern at once', () => {
      const target = flow({ reducedMotion: () => true });
      target.update(1 / 60, { player: LANTERN_POST, light: null });

      expect(target.lantern).toBe('carried');
    });
  });

  it('resets to the fresh state: lantern, ring, cards, lit steps and toasts', () => {
    const onToast = vi.fn();
    const target = flow({ onToast });
    const inside = { x: 0, z: (BEHIND_FALLS.z0 + BEHIND_FALLS.z1) / 2 };
    target.update(0, { player: STEPS[0], light: null });
    target.update(0, { player: ARCH, light: null });
    run(target, 10, inside);
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
    expect(STEPS.some((_, i) => target.stepLit(i))).toBe(false);

    // Still standing behind the falls: the toast comes again, as for a fresh arrival.
    onToast.mockClear();
    target.update(1 / 60, { player: inside, light: null });
    expect(onToast.mock.calls).toEqual([[TOASTS.falls]]);
  });

  it('ignores negative and non-finite time steps', () => {
    const target = installed();

    target.update(-1, { player: FAR, light: null });
    target.update(Number.NaN, { player: FAR, light: null });

    expect(target.ring.radius).toBe(0);
    expect(target.haze).toBe(1);
  });
});

import { TOASTS } from './deslopify.data';

/**
 * The Deslopify walk as a state machine, free of three.js and of the render loop: the lantern, the
 * arch that installs the extension, the ring that spreads the clearing, the haze, the feed cards,
 * the commit steps and the toasts. The scene feeds it the player and the lantern's light each
 * frame and draws what it says.
 *
 * The numbers are the Lichtung prototype's (spec §4), drawn at 10 px = 1 m, so they are metres as
 * they stand: the bowl is small enough for the prototype's own sizes to read right when walked.
 */
export const FLOW = {
  /** Metres from the lantern's post within which it lights by itself. */
  ignitionRadius: 2.6,
  /** Seconds from lighting until the explorer takes the lantern off its hook. */
  carryDelay: 0.9,
  /** Metres the lit lantern's light reaches. */
  lightRadius: 8,
  /** The share of the light's reach that clears fully; it fades out from there to its edge. */
  lightCore: 0.7,
  /** Metres a second the ring spreads while Deslopify is on. */
  ringSpeed: 17,
  /** Metres a second it shrinks back while the wall has it off. */
  ringShrink: 24,
  /** The ring stops growing here: wide enough to cover the bowl from the arch or the wall. */
  ringMax: 72,
  /** The ring shows while smaller than this, fading out towards it. */
  ringVisible: 70,
  /** Metres beyond the ring over which its clearing fades back into the slop. */
  ringEdge: 4,
  /** A boardwalk card's wipe per second in the clear, and back in the slop. */
  cardOn: 2.2,
  cardOff: 0.9,
  /** The wall's card `i` (0 … 3, left to right): each turns a little later than the one before. */
  wallOn: (i: number) => 2.4 - 0.35 * i,
  wallOff: (i: number) => 1.2 + 0.2 * i,
  /** A tag's flip per second in the clear, and back. */
  tagOn: 2.6,
  tagOff: 1.2,
  /** A vine's retreat per second in the clear, and its regrowth in the slop. */
  vineRetreat: 3,
  vineRegrow: 0.35,
  /** Metres from a commit step's middle within which it lights, for good until a restart. */
  stepReach: 2.4,
} as const;

/** The haze closes this fraction of its gap to the ring's coverage per second. */
const HAZE_EASE = 2;

/** A point on the ground plane, in world metres. */
export interface FlowPoint {
  readonly x: number;
  readonly z: number;
}

/** The lantern's light: where it is and how far it reaches this frame (0 when out). */
export interface FlowLight extends FlowPoint {
  readonly radius: number;
}

/** A ring of clearing: where it started and how far it has spread, in metres. */
export interface FlowRing {
  readonly origin: FlowPoint;
  readonly radius: number;
}

/** An axis-aligned box on the ground plane. */
export interface FlowBox {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface FlowFrame {
  readonly player: FlowPoint;
  readonly light: FlowLight | null;
}

/** Unlit on its hook, lit on its hook (for `carryDelay`), then carried by the explorer. */
export type LanternPhase = 'unlit' | 'lit' | 'carried';

/** What the HUD calls the extension's state. */
export type DeslopifyState = 'noch nicht' | 'an' | 'aus';

export interface DeslopifyFlowOptions {
  readonly lanternPost: FlowPoint;
  /** Where the first ring starts. */
  readonly arch: FlowPoint;
  /** Where every later ring starts, once the wall switches Deslopify back on. */
  readonly wall: FlowPoint;
  /** The feed cards beside the boardwalk. */
  readonly cards: readonly FlowPoint[];
  /** The wall's cards, left to right; the flow numbers them after the boardwalk's. */
  readonly wallCards?: readonly FlowPoint[];
  /** The middle of each commit step, bottom to top. */
  readonly steps?: readonly FlowPoint[];
  /** The strip behind the waterfall whose entry is worth a toast. */
  readonly behindFalls?: FlowBox;
  /** Whether a player standing at (x, z) is under the arch. */
  readonly underArch: (x: number, z: number) => boolean;
  /**
   * Whether one frame's move from `a` to `b` passed under the arch: a glide, a teleport or a long
   * frame can carry the player from one side of it to the other without ever standing in it.
   */
  readonly crossesArch?: (a: FlowPoint, b: FlowPoint) => boolean;
  /** Read live: switched on mid-transition, it snaps the ring, the haze and the cards. */
  readonly reducedMotion?: () => boolean;
  /** A passing line for the HUD: the lantern lit, behind the falls, the wall switched. */
  readonly onToast?: (text: string) => void;
  /** Walking under the arch installed Deslopify: the world's key moment. */
  readonly onArchInstall?: () => void;
}

/**
 * How clear (x, z) is, 0 in the slop … 1 cleared: the lantern clears fully inside `lightCore` of
 * its reach and fades out smoothly to its edge, the ring clears fully inside itself and fades out
 * smoothly over `ringEdge` beyond it, and whichever clears more wins. The ground haze's `hazeMask`
 * is this rule turned round (1 − clearance, inside the bowl), and anything that is either slop or
 * original (a card, a tag, a vine) turns where it is 1, so all of them clear together.
 */
export function clearance(
  x: number,
  z: number,
  light: FlowLight | null,
  ring: FlowRing | null,
): number {
  let clear = 0;
  if (light && light.radius > 0) {
    const distance = Math.hypot(x - light.x, z - light.z);
    clear = 1 - smoothstep(FLOW.lightCore * light.radius, light.radius, distance);
  }
  if (ring && ring.radius > 0 && clear < 1) {
    const distance = Math.hypot(x - ring.origin.x, z - ring.origin.z);
    clear = Math.max(clear, 1 - smoothstep(ring.radius, ring.radius + FLOW.ringEdge, distance));
  }
  return clear;
}

export class DeslopifyFlow {
  private readonly options: DeslopifyFlowOptions;
  private readonly reducedMotion: () => boolean;
  /** Every card, the boardwalk's then the wall's, and each one's rates in and out. */
  private readonly cardPoints: readonly FlowPoint[];
  private readonly rates: readonly { readonly on: number; readonly off: number }[];
  private readonly wipes: number[];
  private readonly lit: boolean[];

  private lanternPhase: LanternPhase = 'unlit';
  private lanternLit = false;
  private litFor = 0;
  private installedFlag = false;
  private wallFlag = true;
  private ringOrigin: FlowPoint;
  private ringRadius = 0;
  private readonly ringState: { origin: FlowPoint; radius: number };
  private hazeValue = 1;
  private light: FlowLight | null = null;
  /** Where the player stood last frame, for the arch's crossing test; unset after a reset. */
  private readonly previous = { x: 0, z: 0 };
  private hasPrevious = false;
  private behindFalls = false;
  private cachedStatusState: DeslopifyState | null = null;
  private cachedStatusCleared = -1;
  private cachedStatusLine = '';

  constructor(options: DeslopifyFlowOptions) {
    this.options = options;
    this.reducedMotion = options.reducedMotion ?? (() => false);
    const wallCards = options.wallCards ?? [];
    this.cardPoints = [...options.cards, ...wallCards];
    this.rates = [
      ...options.cards.map(() => ({ on: FLOW.cardOn, off: FLOW.cardOff })),
      ...wallCards.map((_, i) => ({ on: FLOW.wallOn(i), off: FLOW.wallOff(i) })),
    ];
    this.wipes = this.cardPoints.map(() => 0);
    this.lit = (options.steps ?? []).map(() => false);
    this.ringOrigin = options.arch;
    this.ringState = { origin: this.ringOrigin, radius: 0 };
  }

  get lantern(): LanternPhase {
    return this.lanternPhase;
  }

  /** Whether the lantern gives light: from the moment it lights until E puts it out. */
  get lanternOn(): boolean {
    return this.lanternLit;
  }

  /** Set once the player has walked under the arch; nothing but `reset` unsets it. */
  get installed(): boolean {
    return this.installedFlag;
  }

  /** The wall's switch. Only means anything once installed. */
  get wallOn(): boolean {
    return this.wallFlag;
  }

  /** Whether the wall offers its switch: only once Deslopify is installed. */
  get wallAvailable(): boolean {
    return this.installedFlag;
  }

  get state(): DeslopifyState {
    if (!this.installedFlag) {
      return 'noch nicht';
    }
    return this.wallFlag ? 'an' : 'aus';
  }

  /**
   * The current ring: where it started and how far it reaches, in metres. It grows while
   * Deslopify is on and shrinks back to nothing while the wall has it off.
   */
  get ring(): FlowRing {
    this.ringState.origin = this.ringOrigin;
    this.ringState.radius = this.ringRadius;
    return this.ringState;
  }

  /** Whether the ring is spreading: Deslopify installed and switched on. */
  get ringActive(): boolean {
    return this.installedFlag && this.wallFlag;
  }

  /** The ring shows while it is there at all and still under `ringVisible`, growing or shrinking. */
  get ringVisible(): boolean {
    return this.ringRadius > 0 && this.ringRadius < FLOW.ringVisible;
  }

  get ringOpacity(): number {
    return this.ringVisible ? Math.max(0, 1 - this.ringRadius / FLOW.ringVisible) : 0;
  }

  /** How much slop hangs in the air, 1 … 0: what the ring has not yet covered of its reach. */
  get haze(): number {
    return this.hazeValue;
  }

  get clearedCards(): number {
    let count = 0;
    for (const wipe of this.wipes) {
      if (wipe > 0.5) {
        count++;
      }
    }
    return count;
  }

  /** The HUD's state line, e.g. `Deslopify an · Entslopt 8/8`. */
  get statusLine(): string {
    const state = this.state;
    const cleared = this.clearedCards;
    if (state !== this.cachedStatusState || cleared !== this.cachedStatusCleared) {
      this.cachedStatusState = state;
      this.cachedStatusCleared = cleared;
      this.cachedStatusLine = `Deslopify ${state} · Entslopt ${cleared}/${this.wipes.length}`;
    }
    return this.cachedStatusLine;
  }

  /** Card `index`'s wipe, 0 slop … 1 original; the boardwalk's cards first, then the wall's. */
  cardWipe(index: number): number {
    return this.wipes[index] ?? 0;
  }

  /** A card shows its original once its wipe is past half way. */
  cardOriginal(index: number): boolean {
    return this.cardWipe(index) > 0.5;
  }

  /** Whether commit step `index` has been lit by the player coming near it. */
  stepLit(index: number): boolean {
    return this.lit[index] ?? false;
  }

  /** How clear (x, z) is this frame, 0 … 1: `clearance` with the lantern's light and the ring. */
  clearance(x: number, z: number): number {
    return clearance(x, z, this.light, this.ring);
  }

  /** Whether (x, z) is fully cleared: in the core of the lantern's light, or inside the ring. */
  isCleared(x: number, z: number): boolean {
    return this.clearance(x, z) >= 1;
  }

  update(dt: number, frame: FlowFrame): void {
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const reduced = this.reducedMotion();
    const { player } = frame;
    this.light = frame.light && frame.light.radius > 0 ? frame.light : null;

    const post = this.options.lanternPost;
    if (
      this.lanternPhase === 'unlit' &&
      Math.hypot(player.x - post.x, player.z - post.z) < FLOW.ignitionRadius
    ) {
      this.igniteLantern();
    }
    if (this.lanternPhase === 'lit') {
      this.litFor += seconds;
      if (reduced || this.litFor >= FLOW.carryDelay) {
        this.lanternPhase = 'carried';
      }
    }

    if (!this.installedFlag && this.reachedArch(player)) {
      this.install(this.options.arch);
      this.options.onArchInstall?.();
    }
    this.previous.x = player.x;
    this.previous.z = player.z;
    this.hasPrevious = true;

    this.lightSteps(player);
    this.watchFalls(player);

    if (this.installedFlag) {
      if (this.wallFlag) {
        this.ringRadius = reduced
          ? FLOW.ringMax
          : Math.min(FLOW.ringMax, this.ringRadius + FLOW.ringSpeed * seconds);
      } else {
        this.ringRadius = reduced ? 0 : Math.max(0, this.ringRadius - FLOW.ringShrink * seconds);
      }
    }
    const haze = 1 - this.ringRadius / FLOW.ringMax;
    this.hazeValue = reduced
      ? haze
      : this.hazeValue + (haze - this.hazeValue) * Math.min(1, seconds * HAZE_EASE);

    for (let index = 0; index < this.cardPoints.length; index++) {
      const card = this.cardPoints[index]!;
      const rate = this.rates[index]!;
      const cleared = this.isCleared(card.x, card.z);
      if (reduced) {
        this.wipes[index] = cleared ? 1 : 0;
      } else {
        this.wipes[index] = clamp01(this.wipes[index] + (cleared ? rate.on : -rate.off) * seconds);
      }
    }
  }

  /** Lights the lantern on its hook. `false` if it was lit already. */
  igniteLantern(): boolean {
    if (this.lanternPhase !== 'unlit') {
      return false;
    }
    this.lanternPhase = 'lit';
    this.lanternLit = true;
    this.litFor = 0;
    this.options.onToast?.(TOASTS.lantern);
    return true;
  }

  /** Puts the carried lantern out, or lights it again. `false` unless it is carried. */
  toggleLantern(): boolean {
    if (this.lanternPhase !== 'carried') {
      return false;
    }
    this.lanternLit = !this.lanternLit;
    return true;
  }

  /**
   * Installs Deslopify with a ring from `origin`, as walking under the arch does; the project
   * menu's "try it in the world" does it from the wall. `false` if it was installed already.
   */
  install(origin: FlowPoint = this.options.arch): boolean {
    if (this.installedFlag) {
      return false;
    }
    this.installedFlag = true;
    this.wallFlag = true;
    this.startRing(origin);
    this.igniteLantern();
    return true;
  }

  /**
   * The wall's E: off shrinks the ring and lets the slop grow back over the whole bowl, on sends a
   * new ring out from the wall. Does nothing, and says so with `false`, before Deslopify is
   * installed.
   */
  toggleWall(): boolean {
    if (!this.installedFlag) {
      return false;
    }
    this.wallFlag = !this.wallFlag;
    if (this.wallFlag) {
      this.startRing(this.options.wall);
    }
    this.options.onToast?.(this.wallFlag ? TOASTS.wallOn : TOASTS.wallOff);
    return true;
  }

  /** Back to the arrival's state: the lantern on its hook, nothing installed, all slop. */
  reset(): void {
    this.lanternPhase = 'unlit';
    this.lanternLit = false;
    this.litFor = 0;
    this.installedFlag = false;
    this.wallFlag = true;
    this.ringOrigin = this.options.arch;
    this.ringRadius = 0;
    this.hazeValue = 1;
    this.light = null;
    // The restart's jump back to the portal is no walk under the arch.
    this.hasPrevious = false;
    this.behindFalls = false;
    this.wipes.fill(0);
    this.lit.fill(false);
  }

  /** Standing under the arch now, or carried through it since the last frame. */
  private reachedArch(player: FlowPoint): boolean {
    if (this.options.underArch(player.x, player.z)) {
      return true;
    }
    return this.hasPrevious && (this.options.crossesArch?.(this.previous, player) ?? false);
  }

  private startRing(origin: FlowPoint): void {
    this.ringOrigin = origin;
    this.ringRadius = 0;
  }

  private lightSteps(player: FlowPoint): void {
    const steps = this.options.steps ?? [];
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index]!;
      if (!this.lit[index] && Math.hypot(player.x - step.x, player.z - step.z) < FLOW.stepReach) {
        this.lit[index] = true;
      }
    }
  }

  /** Says so once each time the player steps into the strip behind the falls. */
  private watchFalls(player: FlowPoint): void {
    const box = this.options.behindFalls;
    if (!box) {
      return;
    }
    const inside = player.x > box.x0 && player.x < box.x1 && player.z > box.z0 && player.z < box.z1;
    if (inside && !this.behindFalls) {
      this.options.onToast?.(TOASTS.falls);
    }
    this.behindFalls = inside;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

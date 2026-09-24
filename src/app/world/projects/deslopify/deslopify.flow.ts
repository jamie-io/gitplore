import { MAP_SCALE } from '../../environments/jungle-layout';

/**
 * The Deslopify walk as a state machine, free of three.js and of the render loop: the lantern, the
 * arch that installs the extension, the ring that spreads the clearing, the haze and the feed
 * cards. The scene feeds it the player and the lantern's light each frame and draws what it says.
 *
 * The rules are the top-down flow prototype's (#2a of the design handoff), converted to metres with
 * the layout's `MAP_SCALE`: ratios, orders and trigger conditions survive, sizes are physical. Two
 * numbers come from the 3D Lookdev instead, because the map's would be far too large in a walked
 * world: the lantern lights within 2.2 m (the map's 44 px would be 8 m), and the ring runs at
 * 8 m/s (the map's 340 px/s would be 61 m/s).
 */
export const FLOW = {
  /** Metres from the lantern's post within which it lights by itself. */
  ignitionRadius: 2.2,
  /** Seconds from lighting until the explorer takes the lantern off its hook. */
  carryDelay: 0.9,
  /** Metres a second the ring spreads. */
  ringSpeed: 8,
  /** The ring stops growing here (map 1400 px). */
  ringMax: 1400 * MAP_SCALE,
  /** The ring shows while smaller than this, fading out towards it (map 1300 px). */
  ringVisible: 1300 * MAP_SCALE,
  /** The haze is gone once the ring is this wide (map 700 px). */
  hazeSpan: 700 * MAP_SCALE,
  /** The haze closes this fraction of its gap to the target per second. */
  hazeEase: 2,
  /** Card wipe progress per second in the light, and back out of it. */
  cardOn: 2.2,
  cardOff: 1.1,
} as const;

/** A point on the ground plane, in world metres. */
export interface FlowPoint {
  readonly x: number;
  readonly z: number;
}

/** The lantern's light: where it is and how far it reaches this frame (0 when out). */
export interface FlowLight extends FlowPoint {
  readonly radius: number;
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
  /** Every feed card, in the order the scene numbers them. */
  readonly cards: readonly FlowPoint[];
  /** Whether a player standing at (x, z) is under the arch. */
  readonly underArch: (x: number, z: number) => boolean;
  /** Read live: switched on mid-transition, it snaps the ring, the haze and the cards. */
  readonly reducedMotion?: () => boolean;
}

export class DeslopifyFlow {
  private readonly options: DeslopifyFlowOptions;
  private readonly reducedMotion: () => boolean;
  private readonly wipes: number[];

  private lanternPhase: LanternPhase = 'unlit';
  private lanternLit = false;
  private litFor = 0;
  private installedFlag = false;
  private wallFlag = true;
  private ringOrigin: FlowPoint;
  private ringRadius = 0;
  private hazeValue = 1;
  private light: FlowLight | null = null;

  constructor(options: DeslopifyFlowOptions) {
    this.options = options;
    this.reducedMotion = options.reducedMotion ?? (() => false);
    this.wipes = options.cards.map(() => 0);
    this.ringOrigin = options.arch;
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

  /** The current ring: where it started and how far it has spread, in metres. */
  get ring(): { readonly origin: FlowPoint; readonly radius: number } {
    return { origin: this.ringOrigin, radius: this.ringRadius };
  }

  /** The ring clears only while Deslopify is installed and switched on. */
  get ringActive(): boolean {
    return this.installedFlag && this.wallFlag;
  }

  get ringVisible(): boolean {
    return this.ringActive && this.ringRadius < FLOW.ringVisible;
  }

  get ringOpacity(): number {
    return this.ringVisible ? Math.max(0, 1 - this.ringRadius / FLOW.ringVisible) : 0;
  }

  /** How much slop hangs in the air, 1 … 0. */
  get haze(): number {
    return this.hazeValue;
  }

  get clearedCards(): number {
    return this.wipes.filter((wipe) => wipe > 0.5).length;
  }

  /** The HUD's state line, e.g. `Deslopify an · Entslopt 8/8`. */
  get statusLine(): string {
    return `Deslopify ${this.state} · Entslopt ${this.clearedCards}/${this.wipes.length}`;
  }

  cardWipe(index: number): number {
    return this.wipes[index] ?? 0;
  }

  /** A card shows its original once its wipe is past half way. */
  cardOriginal(index: number): boolean {
    return this.cardWipe(index) > 0.5;
  }

  /** Whether (x, z) is cleared: inside the lantern's light, or inside a ring that is on. */
  isCleared(x: number, z: number): boolean {
    const light = this.light;
    if (light && Math.hypot(x - light.x, z - light.z) < light.radius) {
      return true;
    }
    return (
      this.ringActive && Math.hypot(x - this.ringOrigin.x, z - this.ringOrigin.z) < this.ringRadius
    );
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

    if (!this.installedFlag && this.options.underArch(player.x, player.z)) {
      this.install(this.options.arch);
    }

    if (this.ringActive) {
      this.ringRadius = reduced
        ? FLOW.ringMax
        : Math.min(FLOW.ringMax, this.ringRadius + FLOW.ringSpeed * seconds);
    }
    const haze = this.ringActive ? Math.max(0, 1 - this.ringRadius / FLOW.hazeSpan) : 1;
    this.hazeValue = reduced
      ? haze
      : this.hazeValue + (haze - this.hazeValue) * Math.min(1, seconds * FLOW.hazeEase);

    this.options.cards.forEach((card, index) => {
      const cleared = this.isCleared(card.x, card.z);
      this.wipes[index] = reduced
        ? cleared
          ? 1
          : 0
        : clamp01(this.wipes[index] + (cleared ? FLOW.cardOn : -FLOW.cardOff) * seconds);
    });
  }

  /** Lights the lantern on its hook. `false` if it was lit already. */
  igniteLantern(): boolean {
    if (this.lanternPhase !== 'unlit') {
      return false;
    }
    this.lanternPhase = 'lit';
    this.lanternLit = true;
    this.litFor = 0;
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
   * The wall's E: off lets the slop grow back over the whole jungle, on sends a new ring out from
   * the wall. Does nothing, and says so with `false`, before Deslopify is installed.
   */
  toggleWall(): boolean {
    if (!this.installedFlag) {
      return false;
    }
    this.wallFlag = !this.wallFlag;
    if (this.wallFlag) {
      this.startRing(this.options.wall);
    }
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
    this.wipes.fill(0);
  }

  private startRing(origin: FlowPoint): void {
    this.ringOrigin = origin;
    this.ringRadius = 0;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

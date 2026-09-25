import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type { ShotPose } from '@engine/camera/camera-shot';
import type { Interactable } from '@engine/interaction/interactable';
import { FACING_THRESHOLD } from '@engine/interaction/interaction.system';
import { type Collider, floorHeightAt } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import type {
  GroundPoint,
  ScenePitch,
  StationPlate,
  StationSpec,
  StationStand,
} from '@engine/stations/station';
import type { TestSpot, WorldContext } from '@engine/world-object';
import type { Project } from '@content/project.model';
import {
  formatReleaseLine,
  parseDate,
  repositoryLanguages,
  repositoryReleases,
} from '@content/repository-data';
import type { Environment } from '../../environments/environment';
import {
  ARCH,
  BAMBOO,
  BEHIND_FALLS,
  BOARDWALK,
  CAIRN,
  CARD_SLOTS,
  DECK,
  LANTERN_POST,
  LIANA,
  PORTAL,
  Placed,
  Pt,
  STATION_STANDS,
  STEPS,
  TAG_SLOTS,
  TOUR,
  VINE_SLOTS,
  WALL,
  crossesArch,
  glidePath,
  nearestOnPath,
  pointAlong,
  stepCentres,
  underArch,
} from '../../environments/jungle-layout';
import { InWorldDemo, ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import {
  DEMO_HINT,
  FEED_CARDS,
  MOMENT_BANNER,
  PALETTE,
  PITCH,
  PLATES,
  POSTER,
  PROMPTS,
  STATION_NAMES,
  TOASTS,
} from './deslopify.data';
import { DeslopifyFlow, FLOW, FlowLight, FlowPoint } from './deslopify.flow';
import { FeedCard, FeedWall } from './feed-card';
import { Lantern } from './lantern';
import { SlopTags } from './slop-tags';
import { SlopVines } from './slop-vines';

/** Seconds between two cards starting their wipe when several turn in the same frame. */
export const CARD_STAGGER = 0.12;
/** Metres from the post within which E lights the lantern, a little beyond where walking does. */
export const IGNITE_REACH = 3.5;
/** Metres ahead of the visitor the carried lantern's switch sits, and how near it must be. */
const CARRIED_AHEAD = 0.9;
const CARRIED_REACH = 1.2;
/**
 * The wall's switch sits on the front of its ledge, in the middle, and reaches its outer cards:
 * in front of a visitor standing at station 6, a metre off the wall, and of one at the demo's stand.
 */
const WALL_AHEAD = 0.6;
export const WALL_REACH = 5.5;
/** Where "try it in the world" puts the visitor: on the spur, facing the wall. */
export const DEMO_STAND = 3.5;
/** Each card blocks as three posts across its width, too close together to slip between. */
const CARD_BLOCKERS = [-0.85, 0, 0.85] as const;
const CARD_BLOCKER_RADIUS = 0.3;
/**
 * Metres over the walk under them the tags' centres hang: over a visitor's head, a little different
 * for each. Measured from what is walked on there — the boardwalk and the steps stand over the
 * ground — and round the tag's own width, so a climber on the steps passes under it.
 */
export const TAG_HEIGHT = { min: 2.2, max: 2.9 } as const;
const TAG_SPAN = 0.5;
/** Metres over the ground the vines' tops hang from: the canopy line, a little different for each. */
export const VINE_HANG = { min: 5.6, max: 6.8 } as const;
/** The ring is a glowing band this tall, sunk this far under the ground where it starts. */
const RING_HEIGHT = 4;
const RING_SINK = 1.5;
const RING_SEGMENTS = 128;
const RING_GLOW = 0.35;
/** Metres from the portal, a language stalk and the cairn or the liana within which each has a plate. */
const PLATE_REACH = { portal: 3, languages: 3, find: 2.6 } as const;
/**
 * The overview the arrival and the install's moment rise to: the whole bowl from the portal to the
 * falls, looking north and steeply down, so the floor the ring runs over reads too.
 */
const OVERVIEW: ShotPose = Object.freeze({
  position: Object.freeze({ x: 0, y: 30, z: 27 }),
  target: Object.freeze({ x: 0, y: 0, z: -4 }),
});

/** The jungle's commit steps, lit by the flow; only the jungle has them. */
interface CommitSteps {
  setLit(index: number, commits: boolean): void;
}

function commitSteps(environment: Environment): CommitSteps | null {
  const steps = (environment as { steps?: Partial<CommitSteps> }).steps;
  return typeof steps?.setLit === 'function' ? (steps as CommitSteps) : null;
}

/** The jungle's side of the flow: the violet air and the clearing uniforms. */
interface SlopAir {
  setSlop(value: number): void;
  /** Where the lantern's light clears the ground haze; radius 0 while it is dark. */
  setHazeLight?(x: number, z: number, radius: number): void;
  readonly clearing: {
    readonly origin: { readonly value: Vector3 };
    readonly radius: { value: number };
    readonly glow?: { value: number };
  };
}

function slopAir(environment: Environment): SlopAir | null {
  const candidate = environment as Partial<SlopAir>;
  return typeof candidate.setSlop === 'function' && candidate.clearing
    ? (candidate as SlopAir)
    : null;
}

/**
 * Deslopify's own world, the Lichtung: a lantern on the arrival ledge that the explorer takes
 * along, four feed cards beside the marsh boardwalk, vines and tags in the violet slop, the commit
 * steps up to the arch that installs the extension with a ring spreading over the whole bowl, the
 * exhibit in its easel, the feed wall on the north glade whose lever turns it off and on again,
 * the firefly swarm and the cave behind the falls. `DeslopifyFlow` holds the rules; this scene
 * places the things, feeds the flow the player and the light, and draws what it says.
 *
 * It declares seven stations for the station bar and glides, and the plates of its finds; it
 * tells the HUD its toasts and its one key moment, the install from the arch.
 *
 * Nothing here captures the controls: every switch is an ordinary `Interactable`, and the project
 * menu's "try it in the world" only walks the visitor to the wall.
 */
export class DeslopifyScene extends ProjectScene {
  readonly flow: DeslopifyFlow;
  readonly lantern: Lantern;
  /** The four cards beside the boardwalk. */
  readonly cards: readonly FeedCard[];
  readonly wall: FeedWall;
  readonly vines: SlopVines;
  readonly tags: SlopTags;
  readonly ring: Mesh<CylinderGeometry, MeshBasicMaterial>;
  /**
   * The e2e arch walk starts on the top steps, 3 m south of the arch and facing it: a few steps
   * from the trigger even at SwiftShader's frame rate in CI, where every frame advances at most
   * `ENGINE_MAX_FRAME_SECONDS`. Dropped from the top step's height, so it lands on the flight.
   */
  readonly testSpots: Readonly<Record<string, TestSpot>> = {
    'deslopify:bridge-south': { x: ARCH.x, y: STEPS.top, z: ARCH.z + 3, yaw: 0 },
  };

  private readonly sceneOptions: ProjectSceneOptions;
  private readonly air: SlopAir | null;
  private readonly steps: CommitSteps | null;
  /** Which of the eleven steps' periods had commits. */
  private readonly commits: readonly boolean[];
  private readonly stationList: readonly StationSpec[];
  private readonly languagesPlate: StationPlate | null;
  private readonly languageStalks: readonly Pt[];
  private readonly cairnPlate: StationPlate;
  /** Every card, the trail's four then the wall's four, in the flow's order. */
  private readonly allCards: readonly FeedCard[];
  /** Where each card stands, read by the flow; the wall's move to its model's slots when it comes. */
  private readonly cardAnchors: readonly Vector3[];
  private readonly cardGroups: readonly (readonly FeedCard[])[];
  private readonly shownCleared: boolean[];
  private readonly wallCentre: Vector3;
  private readonly lightAt = new Vector3();
  private readonly lightValue = { x: 0, z: 0, radius: 0 };
  private readonly flowFrame = { player: new Vector3(), light: null as FlowLight | null };
  private readonly cleared = (_index: number, anchor: Vector3): boolean =>
    this.flow.isCleared(anchor.x, anchor.z);

  private readonly igniteOffer: Interactable;
  private readonly lanternOffOffer: Interactable;
  private readonly lanternOnOffer: Interactable;
  private readonly wallOffOffer: Interactable;
  private readonly wallOnOffer: Interactable;
  private offers: readonly Interactable[] = [];
  private readonly offerScratch: Interactable[] = [];
  private offersBase: readonly Interactable[] | null = null;
  private merged: readonly Interactable[] = [];
  private lanternIgnited = false;
  private ringFrom: FlowPoint | null = null;
  private ringBase = 0;
  private status: string | null = null;

  private readonly wallDemo: InWorldDemo = {
    mode: 'world',
    demoHint: DEMO_HINT,
    enter: (player) => this.tryAtWall(player),
    interact: () => this.toggleWall(),
    exit: () => undefined,
  };

  constructor(options: ProjectSceneOptions) {
    super({ ...options, poster: POSTER });
    this.sceneOptions = options;
    this.air = slopAir(this.environment);
    this.steps = commitSteps(this.environment);
    this.commits = commitPeriods(options.project.commitBuckets, STEPS.count);
    const ground = this.environment.ground;
    const reducedMotion = options.reducedMotion;

    this.lantern = new Lantern({
      position: this.onGround(LANTERN_POST),
      rotationY: LANTERN_POST.yaw,
      reducedMotion,
      haze: this.haze ?? undefined,
    });

    this.cards = FEED_CARDS.map((data, index) => {
      const card = new FeedCard(data, { reducedMotion });
      this.stand(card, CARD_SLOTS[index]);
      return card;
    });

    // The cards stand on the wall's ledge, where its model's slots put them.
    this.wall = new FeedWall({ reducedMotion });
    this.wall.object.position.copy(this.onGround(WALL));
    this.wall.object.rotation.y = WALL.yaw;
    this.wall.object.updateMatrixWorld(true);
    this.wallCentre = this.wall.object.position.clone();

    this.allCards = [...this.cards, ...this.wall.cards];
    this.cardAnchors = this.allCards.map((card) => card.object.getWorldPosition(new Vector3()));
    this.cardGroups = [this.cards, this.wall.cards];
    this.shownCleared = this.allCards.map(() => false);

    this.vines = new SlopVines({
      anchors: VINE_SLOTS.map(
        ({ x, z }, index) => new Vector3(x, ground.heightAt(x, z) + vineHang(index), z),
      ),
      seed: 26,
      reducedMotion,
      rates: { retreat: FLOW.vineRetreat, regrow: FLOW.vineRegrow },
    });
    const walked = this.environment.colliders;
    this.tags = new SlopTags({
      anchors: TAG_SLOTS.map(({ x, y, z }) => new Vector3(x, y, z)),
      yaws: TAG_SLOTS.map(facingTheWalk),
      ropeLength: (index, anchor) =>
        anchor.y - walkSurface(anchor.x, anchor.z, ground, walked) - tagHeight(index),
      reducedMotion,
      rates: { on: FLOW.tagOn, off: FLOW.tagOff },
    });

    this.flow = new DeslopifyFlow({
      lanternPost: LANTERN_POST,
      arch: ARCH,
      wall: this.wallCentre,
      cards: this.cardAnchors.slice(0, this.cards.length),
      wallCards: this.cardAnchors.slice(this.cards.length),
      steps: stepCentres(),
      behindFalls: BEHIND_FALLS,
      underArch,
      crossesArch,
      glidePath,
      reducedMotion,
      onToast: (text) => this.sceneOptions.onToast?.(text),
      onArchInstall: () => this.sceneOptions.onMoment?.(MOMENT_BANNER),
    });

    this.stationList = stations(this.flow, commitTotal(options.project));
    const languages = languageLine(options.project);
    this.languagesPlate = languages ? PLATES.langs(languages.line) : null;
    this.languageStalks = BAMBOO.slice(0, languages?.count ?? 0);
    this.cairnPlate = PLATES.cairn(latestRelease(options.project));

    this.ring = ringMesh();

    const front = new Vector3(Math.sin(WALL.yaw), 0, Math.cos(WALL.yaw));
    const wallPrompt = this.wallCentre.clone().addScaledVector(front, WALL_AHEAD);
    this.igniteOffer = offer(
      'ignite',
      this.onGround(LANTERN_POST),
      IGNITE_REACH,
      PROMPTS.lanternOn,
      () => this.igniteLantern(),
    );
    // The carried lantern's switch rides just ahead of the visitor; `update` moves it.
    const ahead = new Vector3();
    this.lanternOffOffer = offer('lantern-off', ahead, CARRIED_REACH, PROMPTS.lanternOff, () =>
      this.toggleLantern(),
    );
    this.lanternOnOffer = offer('lantern-on', ahead, CARRIED_REACH, PROMPTS.lanternOn, () =>
      this.toggleLantern(),
    );
    this.wallOffOffer = offer('wall-off', wallPrompt, WALL_REACH, PROMPTS.wallOff, () =>
      this.toggleWall(),
    );
    this.wallOnOffer = offer('wall-on', wallPrompt, WALL_REACH, PROMPTS.wallOn, () =>
      this.toggleWall(),
    );
    this.offers = [this.igniteOffer];

    this.add({
      id: 'deslopify:furniture',
      colliders: [
        ...this.lantern.colliders,
        ...this.cards.flatMap(cardColliders),
        ...this.wall.colliders(),
      ],
      init: () => undefined,
      update: () => undefined,
      dispose: () => undefined,
    });
  }

  /** "Try it in the world": to the wall, with Deslopify on, the controls left with the visitor. */
  override get demo(): InWorldDemo {
    return this.wallDemo;
  }

  /** The seven stops of the tour, portal to cave (spec §2). */
  override get stations(): readonly StationSpec[] {
    return this.stationList;
  }

  override get portalStand(): StationStand {
    return PORTAL;
  }

  override get overview(): ShotPose {
    return OVERVIEW;
  }

  override get pitch(): ScenePitch {
    return PITCH;
  }

  /** Glides follow the boardwalk, the steps and the north loop. */
  override glidePath(from: GroundPoint, to: GroundPoint): readonly GroundPoint[] {
    return glidePath(from, to);
  }

  /**
   * The finds that are no station: the portal within 3 m, the language stalks within 3 m (but not
   * on the deck between them, where the arch's station speaks), the cairn and the liana within
   * 2.6 m. `null` anywhere else.
   */
  override plateAt(x: number, z: number): StationPlate | null {
    if (Math.hypot(x - PORTAL.x, z - PORTAL.z) < PLATE_REACH.portal) {
      return PLATES.portal;
    }
    if (this.languagesPlate && !onDeck(x, z)) {
      for (const stalk of this.languageStalks) {
        if (Math.hypot(x - stalk.x, z - stalk.z) < PLATE_REACH.languages) {
          return this.languagesPlate;
        }
      }
    }
    if (Math.hypot(x - CAIRN.x, z - CAIRN.z) < PLATE_REACH.find) {
      return this.cairnPlate;
    }
    if (Math.hypot(x - LIANA.x, z - LIANA.z) < PLATE_REACH.find) {
      return PLATES.liana;
    }
    return null;
  }

  /** The shared interactables and whichever of the flow's switches are on offer this frame. */
  override get interactables(): readonly Interactable[] {
    const base = super.interactables;
    if (base !== this.offersBase) {
      this.offersBase = base;
      this.merged = [...base, ...this.offers];
    }
    return this.merged;
  }

  override init(ctx: WorldContext): void {
    super.init(ctx);
    this.lantern.init(ctx);
    this.lantern.attachTo(this.explorer.hand, this.explorer.handLight);
    for (const card of this.cards) {
      ctx.scene.add(card.object);
    }
    for (const card of this.allCards) {
      card.loadFrame(ctx.assets, ctx.quality.shadows, this.haze ?? undefined);
    }
    this.wall.loadModel(ctx.assets, ctx.quality.shadows, this.haze ?? undefined, () =>
      this.followWallCards(),
    );
    ctx.scene.add(this.wall.object, this.vines.object, this.tags.object, this.ring);
    this.air?.setSlop(this.flow.haze);
    this.publishStatus();
  }

  override update(dt: number, ctx: WorldContext): void {
    const player = ctx.player;
    this.flowFrame.player = player.position;
    this.flowFrame.light = this.light();
    this.flow.update(dt, this.flowFrame);
    if (this.flow.lantern !== 'unlit' && !this.lanternIgnited) {
      this.lanternIgnited = true;
      this.lantern.ignite();
    }
    this.lantern.update(dt);

    this.syncCards();
    for (const card of this.cards) {
      card.update(dt);
    }
    this.wall.setSwitch(!this.flow.installed ? 'rest' : this.flow.wallOn ? 'on' : 'off');
    this.wall.update(dt);
    this.vines.update(dt, this.cleared);
    this.tags.update(dt, this.cleared);
    this.syncSteps();
    this.syncFireflies();

    if (this.air) {
      this.air.setSlop(this.flow.haze);
      const { origin, radius } = this.flow.ring;
      this.air.clearing.origin.value.set(origin.x, this.air.clearing.origin.value.y, origin.z);
      // The ring clears while it grows and while it shrinks back once the wall has it off.
      this.air.clearing.radius.value = radius;
      if (this.air.clearing.glow) {
        this.air.clearing.glow.value = this.flow.ringOpacity;
      }
      const light = this.flowFrame.light;
      this.air.setHazeLight?.(light?.x ?? 0, light?.z ?? 0, light?.radius ?? 0);
    }
    this.drawRing();

    super.update(dt, ctx);
    this.refreshOffers(player);
    this.publishStatus();
  }

  override dispose(): void {
    // Before the explorer goes: the carried lantern hangs from its hand.
    this.lantern.dispose();
    for (const card of this.cards) {
      card.object.removeFromParent();
      card.dispose();
    }
    this.wall.object.removeFromParent();
    this.wall.dispose();
    this.vines.object.removeFromParent();
    this.vines.dispose();
    this.tags.object.removeFromParent();
    this.tags.dispose();
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    if (this.status !== null) {
      this.status = null;
      this.sceneOptions.onStatus?.(null);
    }
    super.dispose();
  }

  /** E at the post: lights the lantern before walking up to it would. */
  igniteLantern(): void {
    this.flow.igniteLantern();
  }

  /** E while carrying: the lantern goes out, or lights again. */
  toggleLantern(): void {
    if (this.flow.toggleLantern()) {
      this.lantern.toggle();
    }
  }

  /** E at the wall: Deslopify off, or on with a new ring from the wall. Nothing before install. */
  toggleWall(): void {
    this.flow.toggleWall();
  }

  /** Restarts the entire Deslopify journey at the portal on the arrival ledge. */
  restart(player: PlayerController): void {
    this.flow.reset();
    this.syncSteps();
    this.starLanterns.resetSwarm();
    this.lantern.reset();
    this.lanternIgnited = false;
    this.shownCleared.fill(false);
    this.cards.forEach((card) => card.setOriginal(false));
    this.wall.setOriginal(false);
    this.vines.reset();
    this.tags.reset();
    this.ringFrom = null;
    this.ring.visible = false;
    this.air?.setSlop(1);
    this.air?.clearing.origin.value.set(PORTAL.x, this.air.clearing.origin.value.y, PORTAL.z);
    if (this.air) {
      this.air.clearing.radius.value = 0;
      if (this.air.clearing.glow) {
        this.air.clearing.glow.value = 0;
      }
    }
    this.offers = [this.igniteOffer];
    this.offersBase = null;
    // The environment's spawn yaw, not the slot's: the player's yaw convention faces the other way.
    player.teleport(
      this.environment.spawn.clone().setY(this.environment.spawn.y + PLAYER_EYE_HEIGHT),
      this.environment.spawnYaw,
    );
    this.publishStatus();
  }

  /** The liana's pull: the jungle scatters anew, and the fireflies with it. */
  protected override reseed(offset: number): void {
    super.reseed(offset);
    this.starLanterns.burst();
    this.sceneOptions.onToast?.(TOASTS.liana);
  }

  private tryAtWall(player: PlayerController): void {
    const front = new Vector3(Math.sin(WALL.yaw), 0, Math.cos(WALL.yaw));
    const stand = this.wallCentre.clone().addScaledVector(front, DEMO_STAND);
    stand.y = this.environment.ground.heightAt(stand.x, stand.z) + PLAYER_EYE_HEIGHT;
    player.teleport(stand, WALL.yaw);
    if (!this.flow.install(this.wallCentre) && !this.flow.wallOn) {
      this.flow.toggleWall();
    }
  }

  /**
   * The lantern's light this frame, where its glass is; `null` while it gives none. Once lit it
   * reaches `FLOW.lightRadius`, growing and fading with the lantern's glow.
   */
  private light(): FlowLight | null {
    const radius = FLOW.lightRadius * this.lantern.glow;
    if (radius <= 0) {
      return null;
    }
    this.lantern.worldPosition(this.lightAt);
    this.lightValue.x = this.lightAt.x;
    this.lightValue.z = this.lightAt.z;
    this.lightValue.radius = radius;
    return this.lightValue;
  }

  /** The wall's model moved its cards to its slots: the flow's anchors for them follow. */
  private followWallCards(): void {
    this.wall.object.updateMatrixWorld(true);
    this.wall.cards.forEach((card, index) =>
      card.object.getWorldPosition(this.cardAnchors[this.cards.length + index]!),
    );
  }

  /** Each step the visitor has come by glows if its period had commits; a restart darkens all. */
  private syncSteps(): void {
    if (!this.steps) {
      return;
    }
    for (let index = 0; index < this.commits.length; index++) {
      this.steps.setLit(index, this.flow.stepLit(index) && this.commits[index]!);
    }
  }

  /** The swarm follows the lit lantern and glows brighter while Deslopify is on. */
  private syncFireflies(): void {
    this.starLanterns.setLantern(this.flowFrame.light);
    this.starLanterns.setBright(this.flow.ringActive);
  }

  /**
   * Starts each card's wipe when the flow turns it. Cards of one group (the trail's, the wall's)
   * that turn in the same frame go 120 ms apart, so the wall ripples rather than flips.
   */
  private syncCards(): void {
    let index = 0;
    for (const group of this.cardGroups) {
      let rank = 0;
      for (const card of group) {
        const anchor = this.cardAnchors[index]!;
        const cleared = this.flow.isCleared(anchor.x, anchor.z);
        if (cleared !== this.shownCleared[index]) {
          this.shownCleared[index] = cleared;
          card.setOriginal(cleared, rank++ * CARD_STAGGER);
        }
        index++;
      }
    }
  }

  private drawRing(): void {
    const visible = this.flow.ringVisible && this.flow.ring.radius > 0.01;
    this.ring.visible = visible;
    if (!visible) {
      return;
    }
    const { origin, radius } = this.flow.ring;
    if (origin !== this.ringFrom) {
      this.ringFrom = origin;
      this.ringBase = this.bankHeight(origin);
    }
    this.ring.position.set(origin.x, this.ringBase - RING_SINK + RING_HEIGHT / 2, origin.z);
    this.ring.scale.set(radius, 1, radius);
    this.ring.material.opacity = this.flow.ringOpacity * RING_GLOW;
  }

  /**
   * Which switches the flow offers now: the lantern's at its post until it is lit, the wall's once
   * Deslopify is installed, and the carried lantern's while nothing else is in reach — it rides
   * ahead of the visitor, so it would otherwise always be the nearest and hide everything else.
   */
  private refreshOffers(player: PlayerController): void {
    const next = this.offerScratch;
    next.length = 0;
    if (this.flow.lantern === 'unlit') {
      next.push(this.igniteOffer);
    }
    if (this.flow.wallAvailable) {
      next.push(this.flow.wallOn ? this.wallOffOffer : this.wallOnOffer);
    }
    if (this.flow.lantern === 'carried') {
      let busy = false;
      for (const other of super.interactables) {
        if (inReach(player, other)) {
          busy = true;
          break;
        }
      }
      if (!busy) {
        for (const other of next) {
          if (inReach(player, other)) {
            busy = true;
            break;
          }
        }
      }
      if (!busy) {
        this.lanternOffOffer.position.set(
          player.position.x - Math.sin(player.yaw) * CARRIED_AHEAD,
          player.position.y,
          player.position.z - Math.cos(player.yaw) * CARRIED_AHEAD,
        );
        next.push(this.flow.lanternOn ? this.lanternOffOffer : this.lanternOnOffer);
      }
    }
    let changed = next.length !== this.offers.length;
    if (!changed) {
      for (let index = 0; index < next.length; index++) {
        if (next[index] !== this.offers[index]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.offers = next.slice();
      this.offersBase = null;
    }
  }

  private publishStatus(): void {
    const status = this.flow.statusLine;
    if (status !== this.status) {
      this.status = status;
      this.sceneOptions.onStatus?.(status);
    }
  }

  /**
   * The ground a ring starts from: the highest of the ground under its origin and a circle of
   * ground around it, so a ring from the arch stands on the banks, not in the stream bed.
   */
  private bankHeight(origin: FlowPoint): number {
    const ground = this.environment.ground;
    let highest = ground.heightAt(origin.x, origin.z);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      highest = Math.max(
        highest,
        ground.heightAt(origin.x + Math.cos(angle) * 6, origin.z + Math.sin(angle) * 6),
      );
    }
    return highest;
  }

  private onGround(point: Pt): Vector3 {
    return new Vector3(point.x, this.environment.ground.heightAt(point.x, point.z), point.z);
  }

  private stand(card: FeedCard, slot: Placed): void {
    card.object.position.copy(this.onGround(slot));
    card.object.rotation.y = slot.yaw;
    card.object.updateMatrixWorld(true);
  }
}

/** Three posts across the card's width, in world space. */
function cardColliders(card: FeedCard): Collider[] {
  return CARD_BLOCKERS.map((x) => {
    const at = card.object.localToWorld(new Vector3(x, 0, 0));
    return { kind: 'cylinder', x: at.x, z: at.z, radius: CARD_BLOCKER_RADIUS };
  });
}

/**
 * Which of `count` periods of the project's history had commits: the weekly buckets shared out in
 * order, each period taking its run of them (or, with fewer buckets than periods, the one it falls
 * in). No history, no commits.
 */
export function commitPeriods(
  buckets: readonly number[] | undefined,
  count: number = STEPS.count,
): boolean[] {
  const values = buckets ?? [];
  return Array.from({ length: count }, (_, period) => {
    if (values.length === 0) {
      return false;
    }
    const start = Math.floor((period * values.length) / count);
    const end = Math.max(start + 1, Math.floor(((period + 1) * values.length) / count));
    return values.slice(start, end).some((value) => Number.isFinite(value) && value > 0);
  });
}

/** Every commit in the project's history, for the steps' plate. */
function commitTotal(project: Project): number {
  return (project.commitBuckets ?? []).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0),
    0,
  );
}

/** The seven stations of the tour, their plates read from the flow and the project each time. */
function stations(flow: DeslopifyFlow, commits: number): readonly StationSpec[] {
  const plates: Record<(typeof TOUR)[number], () => StationPlate> = {
    laterne: () => PLATES.laterne,
    pfad: () => PLATES.pfad,
    stufen: () => PLATES.stufen(commits),
    bogen: () => PLATES.bogen,
    exponat: () => PLATES.exponat,
    wand: () => (flow.wallAvailable ? PLATES.wandOn : PLATES.wandOff),
    hoehle: () => PLATES.hoehle,
  };
  return Object.freeze(
    TOUR.map((id, index) => ({
      id,
      name: STATION_NAMES[index]!,
      stand: STATION_STANDS[id],
      trigger: 3,
      plate: plates[id],
    })),
  );
}

/**
 * The languages' plate line, largest share first, as many as there are stalks (four at most):
 * e.g. `JavaScript 81 % · HTML 16 % · Python 2 % · Shell <1 %`. `null` without languages.
 */
function languageLine(project: Project): { readonly line: string; readonly count: number } | null {
  const rows = repositoryLanguages(project).slice(0, BAMBOO.length);
  if (rows.length === 0) {
    return null;
  }
  const line = rows
    .map(({ name, share }) => {
      const percent = share * 100;
      return `${name} ${percent < 1 ? '<1' : Math.round(percent)} %`;
    })
    .join(' · ');
  return { line, count: rows.length };
}

/** The newest release as the cairn's plate names it, e.g. `v1.2.0 · 1. September 2025`. */
function latestRelease(project: Project): string | null {
  const releases = project.releases ?? [];
  const rows = repositoryReleases(project);
  let newest = -1;
  let newestAt = -Infinity;
  releases.forEach((release, index) => {
    const at = parseDate(release.date) ?? -Infinity;
    if (newest < 0 || at > newestAt) {
      newest = index;
      newestAt = at;
    }
  });
  return newest < 0 ? null : formatReleaseLine(rows[newest]!);
}

/** Whether (x, z) stands on the deck under the arch. */
function onDeck(x: number, z: number): boolean {
  return Math.abs(x - ARCH.x) <= DECK.halfWidth && Math.abs(z - ARCH.z) <= DECK.halfLength;
}

/**
 * The highest walkable surface round (x, z), a tag's width about: the ground, or the boardwalk or
 * a step standing over it.
 */
function walkSurface(
  x: number,
  z: number,
  ground: { heightAt(x: number, z: number): number },
  colliders: readonly Collider[],
): number {
  let highest = floorHeightAt(x, z, Infinity, ground, colliders);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    highest = Math.max(
      highest,
      floorHeightAt(
        x + Math.cos(angle) * TAG_SPAN,
        z + Math.sin(angle) * TAG_SPAN,
        Infinity,
        ground,
        colliders,
      ),
    );
  }
  return highest;
}

/** The height a tag's centre hangs at, spread over `TAG_HEIGHT` by the golden ratio. */
export function tagHeight(index: number): number {
  const spread = (index * 0.618034) % 1;
  return TAG_HEIGHT.min + (TAG_HEIGHT.max - TAG_HEIGHT.min) * spread;
}

/** The height over the ground a vine's top hangs from, spread over `VINE_HANG` by the golden ratio. */
export function vineHang(index: number): number {
  const spread = (index * 0.618034 + 0.3) % 1;
  return VINE_HANG.min + (VINE_HANG.max - VINE_HANG.min) * spread;
}

/** A tag's turn towards the boardwalk 3 m back towards the portal, where visitors come from. */
function facingTheWalk(tag: Pt): number {
  const target = pointAlong(BOARDWALK, nearestOnPath(tag.x, tag.z, BOARDWALK).along - 3);
  return Math.atan2(target.x - tag.x, target.z - tag.z);
}

function offer(
  name: string,
  position: Vector3,
  radius: number,
  prompt: string,
  onInteract: () => void,
): Interactable {
  return { id: `deslopify:${name}`, position, radius, prompt, onInteract };
}

/** The interaction system's own test: close enough, and in front of the visitor. */
function inReach(player: PlayerController, interactable: Interactable): boolean {
  const dx = interactable.position.x - player.position.x;
  const dz = interactable.position.z - player.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > interactable.radius || distance === 0) {
    return false;
  }
  const facing = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / distance;
  return facing >= FACING_THRESHOLD;
}

/** An open band, amber at its foot and fading to nothing at its top, added over the scene. */
function ringMesh(): Mesh<CylinderGeometry, MeshBasicMaterial> {
  const geometry = new CylinderGeometry(1, 1, RING_HEIGHT, RING_SEGMENTS, 1, true);
  const amber = new Color(PALETTE.original);
  const position = geometry.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const glow = position.getY(i) < 0 ? 1 : 0;
    colours.push(amber.r * glow, amber.g * glow, amber.b * glow);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  const ring = new Mesh(
    geometry,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  ring.name = 'deslopify-ring';
  ring.visible = false;
  ring.frustumCulled = false;
  return ring;
}

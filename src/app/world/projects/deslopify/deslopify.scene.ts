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
import type { Interactable } from '@engine/interaction/interactable';
import { FACING_THRESHOLD } from '@engine/interaction/interaction.system';
import type { Collider } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import type { WorldContext } from '@engine/world-object';
import type { Environment } from '../../environments/environment';
import {
  ARCH,
  CARD_SLOTS,
  LANTERN_POST,
  LANTERN_YAW,
  SPAWN,
  Slot,
  TAG_SLOTS,
  VINE_SLOTS,
  WALL_SLOT,
  underArch,
} from '../../environments/jungle-layout';
import { InWorldDemo, ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { DEMO_HINT, FEED_CARDS, PALETTE, POSTER, PROMPTS } from './deslopify.data';
import { DeslopifyFlow, FlowLight, FlowPoint } from './deslopify.flow';
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
/** The wall's switch sits in front of its middle and reaches its outer cards. */
const WALL_AHEAD = 1.2;
export const WALL_REACH = 5.5;
/** Where "try it in the world" puts the visitor: on the spur, facing the wall. */
export const DEMO_STAND = 3.5;
/** Each card blocks as three posts across its width, too close together to slip between. */
const CARD_BLOCKERS = [-0.85, 0, 0.85] as const;
const CARD_BLOCKER_RADIUS = 0.3;
/** Metres over the ground the tags' centres hang: eye level, a little different for each. */
export const TAG_HEIGHT = { min: 2.2, max: 2.9 } as const;
/** The ring is a glowing band this tall, sunk this far under the ground where it starts. */
const RING_HEIGHT = 4;
const RING_SINK = 1.5;
const RING_SEGMENTS = 128;
const RING_GLOW = 0.35;

/** The jungle's side of the flow: the violet air and the clearing uniforms. */
interface SlopAir {
  setSlop(value: number): void;
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
 * Deslopify's own world, the Turn 2 walk "Der Weg durch den Slop": a lantern at the start of the
 * south trail that the explorer takes along, four feed cards, vines and tags in the violet haze, the
 * arch over the stream that installs the extension with a spreading ring, and the feed wall on the
 * north bank whose switch turns it off and on again. `DeslopifyFlow` holds the rules; this scene
 * places the things, feeds the flow the player and the light, and draws what it says.
 *
 * Nothing here captures the controls: every switch is an ordinary `Interactable`, and the project
 * menu's "try it in the world" only walks the visitor to the wall.
 */
export class DeslopifyScene extends ProjectScene {
  readonly flow: DeslopifyFlow;
  readonly lantern: Lantern;
  /** The four cards along the south trail. */
  readonly cards: readonly FeedCard[];
  readonly wall: FeedWall;
  readonly vines: SlopVines;
  readonly tags: SlopTags;
  readonly ring: Mesh<CylinderGeometry, MeshBasicMaterial>;

  private readonly sceneOptions: ProjectSceneOptions;
  private readonly air: SlopAir | null;
  /** Every card, the trail's four then the wall's four, in the flow's order. */
  private readonly allCards: readonly FeedCard[];
  private readonly shownOriginal: boolean[];
  private readonly wallCentre: Vector3;
  private readonly lightAt = new Vector3();

  private readonly igniteOffer: Interactable;
  private readonly lanternOffOffer: Interactable;
  private readonly lanternOnOffer: Interactable;
  private readonly wallOffOffer: Interactable;
  private readonly wallOnOffer: Interactable;
  private offers: readonly Interactable[] = [];
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
    const ground = this.environment.ground;
    const reducedMotion = options.reducedMotion;

    this.lantern = new Lantern({
      position: this.onGround(LANTERN_POST),
      rotationY: LANTERN_YAW,
      reducedMotion,
    });

    this.cards = FEED_CARDS.map((data, index) => {
      const card = new FeedCard(data, { reducedMotion });
      this.stand(card, CARD_SLOTS[index]);
      return card;
    });

    this.wall = new FeedWall({ reducedMotion });
    this.wall.object.position.copy(this.onGround(WALL_SLOT.position));
    this.wall.object.rotation.y = WALL_SLOT.yaw;
    this.wall.object.updateMatrixWorld(true);
    // Four cards across 9.6 m of uneven bank: each stands on its own patch of ground.
    for (const card of this.wall.cards) {
      const at = card.object.getWorldPosition(new Vector3());
      card.object.position.y = ground.heightAt(at.x, at.z) - this.wall.object.position.y;
    }
    this.wall.object.updateMatrixWorld(true);
    this.wallCentre = this.wall.object.position.clone();

    this.allCards = [...this.cards, ...this.wall.cards];
    this.shownOriginal = this.allCards.map(() => false);

    this.vines = new SlopVines({
      anchors: VINE_SLOTS.map(({ position }) => position),
      seed: 26,
      reducedMotion,
    });
    this.tags = new SlopTags({
      anchors: TAG_SLOTS.map(({ position }) => position),
      yaws: TAG_SLOTS.map(({ yaw }) => yaw),
      ropeLength: (index, anchor) =>
        anchor.y - ground.heightAt(anchor.x, anchor.z) - tagHeight(index),
      reducedMotion,
    });

    this.flow = new DeslopifyFlow({
      lanternPost: LANTERN_POST,
      arch: ARCH,
      wall: this.wallCentre,
      cards: this.allCards.map((card) => card.object.getWorldPosition(new Vector3())),
      underArch,
      reducedMotion,
    });

    this.ring = ringMesh();

    const front = new Vector3(Math.sin(WALL_SLOT.yaw), 0, Math.cos(WALL_SLOT.yaw));
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
      colliders: [...this.lantern.colliders, ...this.allCards.flatMap(cardColliders)],
      init: () => undefined,
      update: () => undefined,
      dispose: () => undefined,
    });
  }

  /** "Try it in the world": to the wall, with Deslopify on, the controls left with the visitor. */
  override get demo(): InWorldDemo {
    return this.wallDemo;
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
    this.cards.forEach((card) => ctx.scene.add(card.object));
    ctx.scene.add(this.wall.object, this.vines.object, this.tags.object, this.ring);
    this.air?.setSlop(this.flow.haze);
    this.publishStatus();
  }

  override update(dt: number, ctx: WorldContext): void {
    const player = ctx.player;
    this.flow.update(dt, { player: player.position, light: this.light() });
    if (this.flow.lantern !== 'unlit' && !this.lanternIgnited) {
      this.lanternIgnited = true;
      this.lantern.ignite();
    }
    this.lantern.update(dt);

    this.syncCards();
    this.cards.forEach((card) => card.update(dt));
    this.wall.update(dt);
    const cleared = (_index: number, anchor: Vector3) => this.flow.isCleared(anchor.x, anchor.z);
    this.vines.update(dt, cleared);
    this.tags.update(dt, cleared);

    if (this.air) {
      this.air.setSlop(this.flow.haze);
      const { origin, radius } = this.flow.ring;
      this.air.clearing.origin.value.set(origin.x, this.air.clearing.origin.value.y, origin.z);
      this.air.clearing.radius.value = this.flow.ringActive ? radius : 0;
      if (this.air.clearing.glow) {
        this.air.clearing.glow.value = this.flow.ringOpacity;
      }
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

  /** Restarts the entire Deslopify journey at the south-bank arrival point. */
  restart(player: PlayerController): void {
    this.flow.reset();
    this.lantern.reset();
    this.lanternIgnited = false;
    this.shownOriginal.fill(false);
    this.cards.forEach((card) => card.setOriginal(false));
    this.wall.setOriginal(false);
    this.ringFrom = null;
    this.ring.visible = false;
    this.air?.setSlop(1);
    this.air?.clearing.origin.value.set(
      SPAWN.position.x,
      this.air.clearing.origin.value.y,
      SPAWN.position.z,
    );
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

  private tryAtWall(player: PlayerController): void {
    const front = new Vector3(Math.sin(WALL_SLOT.yaw), 0, Math.cos(WALL_SLOT.yaw));
    const stand = this.wallCentre.clone().addScaledVector(front, DEMO_STAND);
    stand.y = this.environment.ground.heightAt(stand.x, stand.z) + PLAYER_EYE_HEIGHT;
    player.teleport(stand, WALL_SLOT.yaw);
    if (!this.flow.install(this.wallCentre) && !this.flow.wallOn) {
      this.flow.toggleWall();
    }
  }

  /** The lantern's light this frame, where its glass is; `null` while it gives none. */
  private light(): FlowLight | null {
    const radius = this.lantern.lightRadius;
    if (radius <= 0) {
      return null;
    }
    this.lantern.worldPosition(this.lightAt);
    return { x: this.lightAt.x, z: this.lightAt.z, radius };
  }

  /**
   * Starts each card's wipe when the flow turns it. Cards of one group (the trail's, the wall's)
   * that turn in the same frame go 120 ms apart, so the wall ripples rather than flips.
   */
  private syncCards(): void {
    let index = 0;
    for (const group of [this.cards, this.wall.cards]) {
      let rank = 0;
      for (const card of group) {
        const original = this.flow.cardOriginal(index);
        if (original !== this.shownOriginal[index]) {
          this.shownOriginal[index] = original;
          card.setOriginal(original, rank++ * CARD_STAGGER);
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
    const next: Interactable[] = [];
    if (this.flow.lantern === 'unlit') {
      next.push(this.igniteOffer);
    }
    if (this.flow.wallAvailable) {
      next.push(this.flow.wallOn ? this.wallOffOffer : this.wallOnOffer);
    }
    if (this.flow.lantern === 'carried') {
      const busy = [...super.interactables, ...next].some((other) => inReach(player, other));
      if (!busy) {
        this.lanternOffOffer.position.set(
          player.position.x - Math.sin(player.yaw) * CARRIED_AHEAD,
          player.position.y,
          player.position.z - Math.cos(player.yaw) * CARRIED_AHEAD,
        );
        next.push(this.flow.lanternOn ? this.lanternOffOffer : this.lanternOnOffer);
      }
    }
    if (next.length !== this.offers.length || next.some((entry, i) => entry !== this.offers[i])) {
      this.offers = next;
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

  private onGround(point: Vector3): Vector3 {
    return new Vector3(point.x, this.environment.ground.heightAt(point.x, point.z), point.z);
  }

  private stand(card: FeedCard, slot: Slot): void {
    card.object.position.copy(this.onGround(slot.position));
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

/** The height a tag's centre hangs at, spread over `TAG_HEIGHT` by the golden ratio. */
export function tagHeight(index: number): number {
  const spread = (index * 0.618034) % 1;
  return TAG_HEIGHT.min + (TAG_HEIGHT.max - TAG_HEIGHT.min) * spread;
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

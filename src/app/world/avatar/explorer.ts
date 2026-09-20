import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { DampedAxis } from '@engine/player/damped-axis';
import {
  JUMP_SPEED,
  PLAYER_EYE_HEIGHT,
  PlayerController,
  WALK_SPEED,
} from '@engine/player/player-controller';
import { PlayerVisual } from '@engine/player/player-visual';
import { MAX_RISE_LAG, RISE_LAG, TELEPORT_DISTANCE } from '@engine/player/third-person-rig';
import { WorldContext } from '@engine/world-object';
import type { Mood } from '../environments/mood';

/*
 * Proportions, in metres. The eye is at `PLAYER_EYE_HEIGHT` and the soles are on the ground the
 * controller found, so the figure is built around those two fixed points rather than around a
 * height of its own.
 */

/** Where the legs hang from. Also their length, since the soles stand on the ground. */
const HIP_HEIGHT = 0.92;
/** Joints within the upper body, measured from the hip. */
const TORSO_CENTRE = 0.325;
const SHOULDER_HEIGHT = 0.54;
const HEAD_CENTRE = PLAYER_EYE_HEIGHT - HIP_HEIGHT - 0.02;
const PACK_CENTRE = 0.32;
const COAT_PIVOT = 0.08;
const LAMP_HEIGHT = 0.66;
/** Half the distance between the two hips and between the two shoulders. */
const HIP_SPAN = 0.11;
const SHOULDER_SPAN = 0.27;

/**
 * Peak fore-aft swing of a hip at walking pace, radians.
 *
 * One step is `STRIDE_LENGTH / 2` = 2 m of ground (T3), which no leg 0.92 m long can cover: at this
 * amplitude the sole travels about 1.2 m of it and the rest is admitted slide. That is the honest
 * maximum, and it is the number to raise first if the walk ever reads as gliding — a swing sized
 * for a human 0.75 m step would be a third of this and would read as a shuffle under the same
 * superhuman `WALK_SPEED`.
 */
const LEG_SWING = 0.7;

/** Counter-swing of the arms, as a share of the legs': shoulders move less than hips. */
const ARM_SWING = 0.45;

/**
 * Share of `LEG_SWING` the sideways scissor gets while the player strafes.
 *
 * It is small because the stance is narrow: the hips are `2 · HIP_SPAN` = 0.22 m apart and a leg
 * reaches `HIP_HEIGHT` down to the sole, so a sideways swing of θ carries each sole
 * `HIP_HEIGHT · sin θ` towards the other one. At `0.15 · LEG_SWING` = 0.105 rad the two soles close
 * to 2.7 cm apart at the widest point of the cycle and never pass each other — which knee-less legs
 * can only do as an interpenetration, four times per stride.
 */
const STRAFE_SWING = 0.15;

/** Metres the hips rise at the top of each step. Twice per stride, because a stride is two steps. */
const WALK_BOB = 0.035;

/** Forward tilt of the upper body at full pace, radians. */
const WALK_LEAN = 0.12;

/** How far the head turns with the player's pitch, radians: a neck, not an owl. */
const HEAD_PITCH = 0.5;

/** Metres the chest rises and falls while standing still, and how fast, in radians per second. */
const BREATH_RISE = 0.012;
const BREATH_RATE = 1.6;

/** Seconds the coat takes to catch up with the body it hangs on. */
const COAT_LAG = 0.22;
/** Radians the coat trails by at full pace, and how far it flaps with each step. */
const COAT_TRAIL = 0.3;
const COAT_FLAP = 0.06;

/** Seconds the tuck takes to arrive after leaving the ground, and to unfold after landing. */
const TUCK_LAG = 0.14;
/** Radians the legs come up, the arms splay and the chest curls while airborne. */
const TUCK_LEG = 0.45;
const TUCK_SPLAY = 0.4;
const TUCK_CURL = 0.18;

/**
 * Metres the chest sinks towards the hips on the hardest landing, and the seconds its spring takes
 * to push it back up. The legs stay where they are: they have no knee to bend, and a dip that
 * moved the hips would drive the soles through the floor the player is standing on.
 */
const SETTLE_DIP = 0.1;
const SETTLE_LAG = 0.16;

/** How much darker than the coat the boots, legs and head are: the same hue, out of the light. */
const BODY_SHADE = 0.32;

/** The lamp's own colour, deliberately the same warm light in every world. */
const LAMP_GLOW = 0xffcf8a;

export interface ExplorerOptions {
  /** The world's light and air; the coat is cut from its accent (`Mood.accent`). */
  readonly mood: Mood;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
}

/** The joints, once `init` has built them: nested groups, because there is no skinning here. */
interface Rig {
  /** Carries the walk bob and the breathing; everything else hangs off it. */
  readonly pelvis: Group;
  readonly chest: Group;
  readonly head: Group;
  readonly coat: Group;
  readonly hips: readonly [Group, Group];
  readonly shoulders: readonly [Group, Group];
}

/**
 * The figure the player walks around as: an explorer in a coat, with a backpack and a lamp on the
 * shoulder, cut from the world's own accent so they belong to each place (spec §5).
 *
 * Twelve meshes over three materials, joints as nested `Group`s rotated in code — no skinning,
 * because `AssetService.model()` clones with `Object3D.clone()`, which a skinned mesh does not
 * survive. Every part of the pose is read from the controller: the position, the yaw, the footing
 * and the one `stridePhase` the footstep audio reads too, so the legs and the sounds can never
 * drift apart.
 */
export class Explorer implements PlayerVisual {
  /** Empty until `init`: a scene may be built and thrown away, and must hold no GPU memory first. */
  readonly object = new Group();

  private readonly mood: Mood;
  private readonly reducedMotion: () => boolean;
  private readonly materials: MeshStandardMaterial[] = [];
  private rig: Rig | null = null;
  private firstPerson = false;
  /** Whether this world's tier renders shadows at all, from `init` on. */
  private shadows = false;

  /** Where the soles stood last frame, so this one knows how much ground was covered. */
  private readonly previous = { x: 0, y: 0, z: 0 };
  private following = false;
  /** True between leaving the ground and touching it again, so a landing is spotted exactly once. */
  private airborne = false;
  /** Metres per second the figure was dropping at, read on the frame it lands. */
  private descent = 0;
  private time = 0;

  /**
   * The soles' own height. A step up is an instantaneous `STEP_HEIGHT` teleport of the player, and
   * the camera's anchor smooths it away with `RISE_LAG`; driving the figure straight from the
   * position would pop it on every crate. It runs on the rig's spring, with the rig's cap, so the
   * figure holds still on screen while the climb is smoothed underneath it.
   */
  private readonly soleY = new DampedAxis();
  private readonly coatPitch = new DampedAxis();
  private readonly coatRoll = new DampedAxis();
  private readonly tuck = new DampedAxis();
  private readonly settle = new DampedAxis();

  constructor(options: ExplorerOptions) {
    this.mood = options.mood;
    this.reducedMotion = options.reducedMotion;
    this.object.name = 'explorer';
  }

  /** Builds the figure and puts it in the world. Called once, by the scene that owns it. */
  init(ctx: WorldContext): void {
    if (this.rig) {
      return;
    }

    this.shadows = ctx.quality.shadows;
    this.rig = this.build();
    // Casting only: the shadow box is 64 m across, so the figure is about seven texels wide, and
    // letting it receive its own shadow at that resolution buys acne rather than modelling.
    this.object.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
      }
    });
    ctx.scene.add(this.object);
  }

  /**
   * Hides the body in first person **without** taking its shadow away, which is what keeps the
   * visitor present in the world even when they cannot see themselves.
   *
   * Two obvious routes do not work. `object.visible = false` skips the object in the shadow pass as
   * well — it is the first line of `WebGLShadowMap.renderObject` — and so does moving it to another
   * layer, because that same function tests `object.layers` against the **main** camera rather than
   * against the shadow camera. Writing neither colour nor depth leaves the draw call in place and
   * contributes nothing to the frame, while the shadow pass, which renders with its own depth
   * material, never looks at either flag.
   */
  setFirstPerson(on: boolean): void {
    this.firstPerson = on;
    for (const material of this.materials) {
      material.colorWrite = !on;
      material.depthWrite = !on;
    }
    // The one case where dropping the object is safe, because there is then no shadow left to
    // lose: the weakest tier draws none at all, and twelve draw calls that write nothing and cast
    // nothing are twelve draw calls off the tier whose frame budget is pinned.
    this.object.visible = !on || this.shadows;
  }

  sync(player: PlayerController, dt: number): void {
    const rig = this.rig;
    if (!rig || dt <= 0) {
      return;
    }

    this.time += dt;
    const reduced = this.reducedMotion();
    const sole = player.position.y - PLAYER_EYE_HEIGHT;
    if (!this.following) {
      // Placed, not eased: a figure that has never seen this player has nothing to ease from.
      this.remember(player, sole);
      this.soleY.reset(sole);
      this.following = true;
    }

    const dx = player.position.x - this.previous.x;
    const dz = player.position.z - this.previous.z;
    const dy = sole - this.previous.y;
    const covered = Math.hypot(dx, dz);
    // The rig's own test, from the rig's own constant: ground no run and no jump together could
    // cover in one capped frame was not walked, it was a teleport somewhere else.
    const teleported = Math.hypot(dx, dy, dz) > TELEPORT_DISTANCE;
    // Capped at a walk: running cycles the legs faster, through `stridePhase`, rather than
    // swinging them further. A teleport walked no ground at all, so it moves nothing.
    const pace = teleported ? 0 : Math.min(covered / (dt * WALK_SPEED), 1);
    // The movement direction in the body's own frame, so the legs scissor sideways when the player
    // strafes and swing backwards when they walk backwards — with nothing to flicker at the
    // crossover, because both components simply pass through zero.
    const forward =
      covered > 0 ? (-Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz) / covered : 0;
    const side =
      covered > 0 ? (Math.cos(player.yaw) * dx - Math.sin(player.yaw) * dz) / covered : 0;

    if (!player.grounded) {
      this.descent = Math.max(0, (this.previous.y - sole) / dt);
    } else if (this.airborne) {
      // Landed: the harder the arrival, the deeper the chest drops into the settle.
      this.settle.reset(Math.min(this.descent / JUMP_SPEED, 1));
      this.descent = 0;
    }
    this.airborne = !player.grounded;
    if (teleported) {
      // Placed, exactly as the rig places its anchor. Easing after a teleport would leave the
      // figure `MAX_RISE_LAG` behind a camera that has already arrived — and on a drop that puts
      // the head above the boom's anchor, which is the camera looking out from inside it.
      this.soleY.reset(sole);
    } else {
      this.soleY.step(sole, reduced ? 0 : RISE_LAG, dt, MAX_RISE_LAG);
    }
    this.remember(player, sole);

    this.object.position.set(player.position.x, this.soleY.value, player.position.z);
    this.object.rotation.y = player.yaw;

    this.tuck.step(player.grounded ? 0 : 1, reduced ? 0 : TUCK_LAG, dt);
    this.settle.step(0, reduced ? 0 : SETTLE_LAG, dt);
    this.poseBody(rig, player, pace, forward, reduced);
    this.poseLimbs(rig, player, pace, forward, side);
    this.poseCoat(rig, player, pace, forward, side, reduced, dt);
  }

  dispose(): void {
    disposeObject3D(this.object);
    this.object.clear();
    this.materials.length = 0;
    this.rig = null;
    this.following = false;
  }

  private remember(player: PlayerController, sole: number): void {
    this.previous.x = player.position.x;
    this.previous.y = sole;
    this.previous.z = player.position.z;
  }

  private poseBody(
    rig: Rig,
    player: PlayerController,
    pace: number,
    forward: number,
    reduced: boolean,
  ): void {
    // Twice per stride, peaking at mid-stance — phase 0 and π, where a foot lands and the legs
    // pass each other. That is where real hips are highest, and with knee-less legs it is also
    // where the soles are lowest: a leg swung out by `LEG_SWING` lifts its own sole about 0.22 m,
    // so a bob peaking at maximum spread would add to that float instead of covering it.
    const bob = (1 + Math.cos(2 * player.stridePhase)) * 0.5 * WALK_BOB * pace;
    const breath = reduced ? 0 : Math.sin(this.time * BREATH_RATE) * BREATH_RISE * (1 - pace);
    rig.pelvis.position.y = HIP_HEIGHT + bob + breath;
    rig.chest.position.y = -this.settle.value * SETTLE_DIP;
    // Negative pitches the chest forward: a positive X rotation takes +Y towards +Z, which is back.
    rig.chest.rotation.x = -WALK_LEAN * pace * forward - this.tuck.value * TUCK_CURL;
    // The neck takes the chest's lean back out, so the head still aims where the player looks.
    rig.head.rotation.x = clamp(player.pitch, -HEAD_PITCH, HEAD_PITCH) - rig.chest.rotation.x;
  }

  private poseLimbs(
    rig: Rig,
    player: PlayerController,
    pace: number,
    forward: number,
    side: number,
  ): void {
    const swing = Math.sin(player.stridePhase) * pace;
    const tuck = this.tuck.value;

    rig.hips.forEach((hip, index) => {
      const lead = index === 0 ? swing : -swing;
      hip.rotation.x = lead * LEG_SWING * forward + tuck * TUCK_LEG;
      hip.rotation.z = lead * LEG_SWING * STRAFE_SWING * side;
    });
    rig.shoulders.forEach((shoulder, index) => {
      // Against the leg on the same side, which is what an arm does.
      const lead = index === 0 ? -swing : swing;
      shoulder.rotation.x = lead * ARM_SWING * forward;
      shoulder.rotation.z = (index === 0 ? -tuck : tuck) * TUCK_SPLAY;
    });
  }

  private poseCoat(
    rig: Rig,
    player: PlayerController,
    pace: number,
    forward: number,
    side: number,
    reduced: boolean,
    dt: number,
  ): void {
    // The coat follows the body rather than the input: it swings out when the walk starts, settles
    // into a trail while it holds, and catches up again when it stops.
    this.coatPitch.step(forward * pace, reduced ? 0 : COAT_LAG, dt);
    this.coatRoll.step(side * pace, reduced ? 0 : COAT_LAG, dt);
    rig.coat.rotation.x =
      -this.coatPitch.value * COAT_TRAIL + Math.sin(player.stridePhase) * COAT_FLAP * pace;
    rig.coat.rotation.z = -this.coatRoll.value * COAT_TRAIL;
  }

  /** Twelve meshes over three materials; the symmetrical parts share one geometry. */
  private build(): Rig {
    const coat = this.material(this.mood.accent, 0.72);
    const body = this.material(
      new Color(this.mood.accent).multiplyScalar(BODY_SHADE).getHex(),
      0.88,
    );
    const lamp = this.material(LAMP_GLOW, 0.4);
    lamp.emissive = new Color(LAMP_GLOW);
    lamp.emissiveIntensity = 1.8;

    const legGeometry = new CapsuleGeometry(0.095, 0.6, 2, 6);
    const bootGeometry = new BoxGeometry(0.17, 0.11, 0.27);
    const armGeometry = new CapsuleGeometry(0.075, 0.36, 2, 6);

    const pelvis = new Group();
    pelvis.name = 'explorer-pelvis';
    pelvis.position.y = HIP_HEIGHT;

    const chest = new Group();
    chest.name = 'explorer-chest';
    chest.add(
      mesh(new BoxGeometry(0.46, 0.65, 0.28), coat, 0, TORSO_CENTRE, 0),
      // Backwards is +Z: forward is −Z at yaw 0, the whole engine over.
      mesh(new BoxGeometry(0.34, 0.4, 0.2), coat, 0, PACK_CENTRE, 0.23),
    );

    const head = new Group();
    head.name = 'explorer-head';
    head.position.y = HEAD_CENTRE;
    head.add(mesh(new BoxGeometry(0.26, 0.26, 0.26), body, 0, 0, 0));

    const coatGroup = new Group();
    coatGroup.name = 'explorer-coat';
    coatGroup.position.y = COAT_PIVOT;
    // Six sides, flared, and kept inside the player's own 0.35 m radius so it never hangs in a wall.
    coatGroup.add(mesh(new CylinderGeometry(0.26, 0.34, 0.52, 6), coat, 0, -0.26, 0));

    const lampHousing = mesh(
      new CylinderGeometry(0.05, 0.06, 0.1, 6),
      body,
      -0.17,
      LAMP_HEIGHT,
      -0.04,
    );
    // Laid on its side so it points the way the explorer is walking.
    lampHousing.rotation.x = Math.PI / 2;
    chest.add(
      head,
      coatGroup,
      lampHousing,
      mesh(new IcosahedronGeometry(0.06, 0), lamp, -0.17, LAMP_HEIGHT, -0.13),
    );

    const shoulders = [-1, 1].map((sign) => {
      const shoulder = new Group();
      shoulder.name = `explorer-shoulder-${sign < 0 ? 'left' : 'right'}`;
      shoulder.position.set(sign * SHOULDER_SPAN, SHOULDER_HEIGHT, 0);
      // Darker than the coat, so the arms read against it while they swing.
      shoulder.add(mesh(armGeometry, body, 0, -0.255, 0));
      chest.add(shoulder);
      return shoulder;
    }) as [Group, Group];

    const hips = [-1, 1].map((sign) => {
      const hip = new Group();
      hip.name = `explorer-hip-${sign < 0 ? 'left' : 'right'}`;
      hip.position.x = sign * HIP_SPAN;
      const boot = mesh(bootGeometry, body, 0, -HIP_HEIGHT + 0.055, -0.03);
      boot.name = `explorer-boot-${sign < 0 ? 'left' : 'right'}`;
      hip.add(mesh(legGeometry, body, 0, -0.415, 0), boot);
      pelvis.add(hip);
      return hip;
    }) as [Group, Group];

    pelvis.add(chest);
    this.object.add(pelvis);
    // A mode chosen before the figure existed still has to reach the materials it was meant for.
    this.setFirstPerson(this.firstPerson);
    return { pelvis, chest, head, coat: coatGroup, hips, shoulders };
  }

  private material(color: number, roughness: number): MeshStandardMaterial {
    // Flat-shaded, so the capsules facet like the rest of the low-poly world.
    const material = new MeshStandardMaterial({ color, roughness, flatShading: true });
    this.materials.push(material);
    return material;
  }
}

function mesh(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
  const part = new Mesh(geometry, material);
  part.position.set(x, y, z);
  return part;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

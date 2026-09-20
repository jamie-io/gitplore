import { PerspectiveCamera, Vector3 } from 'three';
import { CameraRig, RigFrame } from './camera-rig';
import { Collider, HeightField, STEP_HEIGHT, resolveCollisions } from './collision';
import { DampedAxis } from './damped-axis';
import { PlayerController } from './player-controller';

/** Metres from the boom's anchor to the camera when nothing stands in the way. */
export const BOOM_LENGTH = 3.6;

/** How far above the eye the boom is anchored, so the view looks slightly down over the figure. */
export const BOOM_HEIGHT = 0.35;

/**
 * Samples taken along the boom while looking for the furthest point still clear of the props. Six
 * over 3.6 m is one every 0.6 m, and since each sample keeps the camera's own width clear as well,
 * nothing solid can fit between two of them unseen.
 */
export const BOOM_STEPS = 6;

/** Half the width the camera counts as having when asking whether a point is inside a prop. */
export const BOOM_RADIUS = 0.3;

/** However far down the boom swings, the camera stays this far above the terrain. */
export const GROUND_CLEARANCE = 0.4;

/**
 * Smoothing time of the horizontal follow, in seconds: roughly how long the boom's anchor takes to
 * catch up with the head. It is what makes the camera trail the player instead of being welded on.
 */
export const FOLLOW_LAG = 0.12;

/**
 * Smoothing time of the vertical follow — slower than the horizontal one, and deliberately its own
 * term. Stepping onto a crate raises the eye by a whole `STEP_HEIGHT` between two frames, and
 * nothing in the controller smooths that; without this the climb reads as a jolt. It is also what
 * gives a landing its dip: the camera arrives carrying the fall's momentum and settles afterwards.
 */
export const RISE_LAG = 0.18;

/**
 * How far the camera may trail the head vertically. One step is the largest vertical teleport the
 * controller can make in a single frame, so a climb is smoothed in full while a fall still carries
 * the camera down with the player rather than leaving it hanging in the air.
 */
export const MAX_RISE_LAG = STEP_HEIGHT;

/**
 * Further than a full-speed run and a jump together could cover in one capped frame: 8.55 m/s
 * sideways and 7 m/s up, over 0.05 s, is 0.55 m. Only a teleport into another world moves the
 * player this far, and the boom snaps there instead of flying across the map to reach it.
 */
const TELEPORT_DISTANCE = 2;

/**
 * Third-person view: the camera hangs on a boom behind the player's head, orbited by pitch and
 * reeled in by whatever stands between the two. Only the boom's anchor eases — the aim is taken
 * straight from the player — so looking around stays as crisp as it is in first person.
 */
export class ThirdPersonRig implements CameraRig {
  private readonly anchorX = new DampedAxis();
  private readonly anchorY = new DampedAxis();
  private readonly anchorZ = new DampedAxis();
  /** How far out the boom currently reaches; in at once, out on the follow spring. */
  private readonly reach = new DampedAxis();

  /** Where the player stood last frame; more ground than they could walk means a teleport. */
  private readonly previous = new Vector3();
  private following = false;

  constructor(private readonly camera: PerspectiveCamera) {
    // Yaw first, then pitch: the ZXY default would roll the view when looking up while turning.
    camera.rotation.order = 'YXZ';
  }

  reset(): void {
    // `followHead` reads "never seen the player" as a teleport, which snaps the anchor and the
    // boom's length together — exactly what switching back into this view should look like.
    this.following = false;
  }

  sync(player: PlayerController, frame: RigFrame): void {
    const teleported = this.followHead(player, frame);

    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;
    this.camera.rotation.z = 0;

    this.extendBoom(player, frame, teleported);
  }

  /**
   * Eases the boom's anchor towards the head, or snaps to it when the player was teleported.
   * Reports which, because a boom that has just arrived in another world should not ease out of
   * whatever length it had in the last one.
   */
  private followHead(player: PlayerController, frame: RigFrame): boolean {
    const x = player.position.x;
    const y = player.position.y + BOOM_HEIGHT;
    const z = player.position.z;
    const teleported =
      !this.following || this.previous.distanceTo(player.position) > TELEPORT_DISTANCE;

    this.previous.copy(player.position);
    this.following = true;

    if (teleported) {
      this.anchorX.reset(x);
      this.anchorY.reset(y);
      this.anchorZ.reset(z);
      return true;
    }

    // Reduced motion is about the camera, not about the player: the head still moves, the camera
    // just stops easing after it.
    const follow = frame.reducedMotion ? 0 : FOLLOW_LAG;
    this.anchorX.step(x, follow, frame.dt);
    this.anchorZ.step(z, follow, frame.dt);
    this.anchorY.step(y, frame.reducedMotion ? 0 : RISE_LAG, frame.dt, MAX_RISE_LAG);
    return false;
  }

  /**
   * Marches outwards from the anchor to the furthest sample still clear of every prop, and puts
   * the camera there. No raycast: colliders are XZ footprints and the ground is analytic, so
   * walking the boom is both cheaper and exactly as truthful as tracing it would be.
   *
   * Every point short of the furthest clear sample is clear as well, which is what lets the boom
   * sit part of the way out while it eases. Two things make that true, and it is worth being
   * precise about them. In XZ, samples 0.6 m apart each keep the camera's own 0.3 m width clear,
   * so nothing solid fits between two of them. In Y, each sample is judged at the lower end of the
   * span behind it rather than at its own height: whether a collider is skipped depends on where
   * its `top` lies relative to the camera, and the boom's height slides by `|sin(pitch)|` per
   * metre, so a sample high enough to pass over a crate says nothing about the stretch of boom
   * leading up to it.
   */
  private extendBoom(player: PlayerController, frame: RigFrame, teleported: boolean): void {
    const level = Math.cos(player.pitch);
    // Straight back along the look direction, so pitch orbits the boom instead of tilting the head.
    const backX = Math.sin(player.yaw) * level;
    const backY = -Math.sin(player.pitch);
    const backZ = Math.cos(player.yaw) * level;

    const y = liftedOverGround(
      this.anchorX.value,
      this.anchorY.value,
      this.anchorZ.value,
      frame.ground,
    );
    // The player is always outside the props, the eased anchor is not: a smoothed path around a
    // house corner cuts into it. The march may not start from inside, so the anchor is held clear
    // exactly as the player's own feet are.
    const { x, z } = resolveCollisions(
      this.anchorX.value,
      this.anchorZ.value,
      BOOM_RADIUS,
      frame.colliders,
      y - STEP_HEIGHT,
    );
    // Blocked at the very first sample, the boom has nowhere to go and the camera sits on the
    // anchor — first person in all but name, and the only honest answer when there is no room
    // behind the player at all.
    let clear = 0;
    /** Where the boom stood at the end of the last span, so this one can be judged at its lowest. */
    let behind = y;
    for (let step = 1; step <= BOOM_STEPS; step++) {
      const distance = (BOOM_LENGTH * step) / BOOM_STEPS;
      const sampleX = x + backX * distance;
      const sampleZ = z + backZ * distance;
      const sampleY = liftedOverGround(sampleX, y + backY * distance, sampleZ, frame.ground);

      if (!isClear(sampleX, Math.min(sampleY, behind), sampleZ, frame.colliders)) {
        break;
      }
      behind = sampleY;
      clear = distance;
    }

    this.reach.step(clear, frame.reducedMotion || teleported ? 0 : FOLLOW_LAG, frame.dt);
    // Never further out than the sample proved clear. That one guard is also what brings the boom
    // in the instant a wall appears, while it still eases back out once the wall is behind it: a
    // camera may take its time coming out, it may not take its time leaving a wall.
    if (this.reach.value > clear) {
      this.reach.reset(clear);
    }

    const reach = this.reach.value;
    const cameraX = x + backX * reach;
    const cameraZ = z + backZ * reach;
    this.camera.position.set(
      cameraX,
      liftedOverGround(cameraX, y + backY * reach, cameraZ, frame.ground),
      cameraZ,
    );
  }
}

/** The boom may swing below the ground; the visitor may not end up under it. */
function liftedOverGround(x: number, y: number, z: number, ground: HeightField): number {
  return Math.max(y, ground.heightAt(x, z) + GROUND_CLEARANCE);
}

/**
 * Whether the camera may sit at this point. It reuses the player's own containment maths rather
 * than keeping a second copy of it: a point `resolveCollisions` moves at all was inside something.
 * Colliders whose walkable `top` lies at or below the camera are skipped, which is what passing
 * feet one `STEP_HEIGHT` below the camera asks for — the boom passes over a crate instead of being
 * reeled in by it.
 */
function isClear(x: number, y: number, z: number, colliders: readonly Collider[]): boolean {
  const resolved = resolveCollisions(x, z, BOOM_RADIUS, colliders, y - STEP_HEIGHT);
  return resolved.x === x && resolved.z === z;
}

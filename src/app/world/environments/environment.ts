import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldObject } from '@engine/world-object';
import type { EnvironmentId } from '@content/project.model';
import type { LandmarkPlacement } from '../landmarks/base/landmark';
import type { Mood } from './mood';
import type { Position } from './placement';

/**
 * Where a scene may put a landmark. The same two fields a `Landmark` is constructed from, so it is
 * that type rather than a parallel one: the spec's `Anchor` and the code's `LandmarkPlacement` are
 * the same idea, and two names for one shape drift.
 */
export type Anchor = LandmarkPlacement;

/**
 * The surroundings, knowing nothing about projects (spec §5).
 *
 * `ground`, `colliders` and `anchors()` must all work before `init()`, because a scene collects its
 * colliders and places its landmarks in its constructor — the same contract `Landmark.describe()`
 * already honours.
 */
export interface Environment extends WorldObject {
  readonly id: EnvironmentId;
  /** The German name of the place, e.g. "Dschungel". Read by the HUD and the announcement (§7). */
  readonly name: string;
  /**
   * The place's light and air. Exposed because a scene standing in this environment has to match
   * it — the explorer's coat is cut from `mood.accent` — and reading it back off the environment
   * is the only way that cannot disagree with what the sky and the sun were built from.
   */
  readonly mood: Mood;
  readonly ground: HeightField;
  /** Ground-level point a player arriving in this environment stands on. */
  readonly spawn: Vector3;
  /** The yaw such a player faces. */
  readonly spawnYaw: number;
  /** What the environment itself blocks — walls, trees, a fountain. */
  readonly colliders: readonly Collider[];
  readonly interactables?: readonly Interactable[];
  /**
   * `count` places to stand a landmark, turned to face an approaching visitor. Layout is the
   * environment's business: a clearing scatters differently from a plaza.
   *
   * `avoid` holds positions pinned by hand in `repo-overrides.ts`. Only the clearing is ever asked
   * to honour it, because only the start world mixes pinned and generated landmarks — a
   * `ProjectScene` asks for exactly one anchor and pins nothing. The ring can grow until its spots
   * clear; fixed-extent layouts may return fewer anchors when invariants cannot seat every requested
   * landmark. Callers must omit projects without one.
   */
  anchors(count: number, avoid?: readonly Position[]): readonly Anchor[];
}

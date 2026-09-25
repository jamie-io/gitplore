import { Vector3 } from 'three';
import { Interactable } from '@engine/interaction/interactable';
import { Collider, HeightField } from '@engine/player/collision';
import type { GroundPoint, StationSpec, StationStand } from '@engine/stations/station';
import { WorldObject } from '@engine/world-object';
import type { EnvironmentId } from '@content/project.model';
import type { LandmarkPlacement } from '../landmarks/base/landmark';
import type { Mood } from './mood';
import type { Position } from './placement';
import type { SharedUniforms } from './shaders/shared-uniforms';

/**
 * Where a scene may put a landmark. The same two fields a `Landmark` is constructed from, so it is
 * that type rather than a parallel one: the spec's `Anchor` and the code's `LandmarkPlacement` are
 * the same idea, and two names for one shape drift.
 */
export type Anchor = LandmarkPlacement;

/** A disc of ground to keep bare, in world XZ. */
export interface GroundClearing {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Where a shared toy stands and the way it faces (exhibit convention: 0 faces +Z). */
export interface ToySpot {
  readonly position: Vector3;
  readonly rotationY: number;
}

/** A line a shared toy is laid along, from the end nearer the arrival. */
export interface ToyLine {
  readonly from: Vector3;
  readonly to: Vector3;
}

/**
 * Where a project world's shared toys stand, for an environment that lays its ground out around
 * them: the terminal, the seed lever, if the world has one, the commit ridge, the language row
 * (its centre, the row running across the way it faces, or one stalk at each of `stalks`), the
 * release cairns (laid beside their line like the ridge's cairns) and the star lanterns (over
 * their line's midpoint). An environment that shows the commits its own way (the jungle's steps)
 * lays out no ridge.
 */
export interface ToyLayout {
  readonly terminal: ToySpot;
  readonly lever?: ToySpot;
  readonly ridge?: ToyLine;
  readonly languages: ToySpot & { readonly stalks?: readonly Vector3[] };
  readonly releases: ToyLine;
  readonly stars: ToyLine;
}

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
  /**
   * Where a project world's return portal stands, if the environment gives it a place of its own:
   * turned to face `spawn`, a landmark's `SPAWN_DISTANCE` behind it, so the visitor still arrives
   * on `spawn` facing `spawnYaw`. Without it the portal stands on `spawn` itself, turned away, and
   * the visitor arrives that distance ahead of it.
   */
  readonly returnPortal?: Anchor;
  /** What the environment itself blocks — walls, trees, a fountain. */
  readonly colliders: readonly Collider[];
  readonly interactables?: readonly Interactable[];
  /**
   * The uniforms the environment's own surfaces share — sun, fog, dapple — if it has them; a
   * scene hazes the models it places with them, so they stand in the same air.
   */
  readonly shared?: SharedUniforms;
  /**
   * The seed lever's hook: scatters the collider-free decoration again from every decoration seed
   * shifted by `offset`. Terrain, paths and anything that places a collider never move, and the
   * offset is never stored, so a rebuilt world always starts from offset 0.
   */
  reseedDecoration?(offset: number): void;
  /**
   * Ground a scene has furnished itself — the start world's camp — and wants kept free of grass
   * and flowers. Called in the scene's constructor, before `init`; nothing that places a collider
   * moves for it.
   */
  keepClear?(areas: readonly GroundClearing[]): void;
  /**
   * Where a project world's shared toys stand, if this environment lays them out itself. Without
   * it the scene stands them along the straight walk from the arrival to the exhibit.
   */
  toyLayout?(): ToyLayout;
  /**
   * The places a player can be glided to, if the environment lays out stations: a project world
   * standing here takes them over unless its own scene declares others. Knows nothing about the
   * project, so its plates speak of what the toys at each station show.
   */
  stations?(): readonly StationSpec[];
  /** Where the 0 key glides to, in front of the return portal, for an environment with stations. */
  readonly portalStand?: StationStand;
  /** The route a glide takes between two spots; without it the kit glides in a straight line. */
  glidePath?(from: GroundPoint, to: GroundPoint): readonly GroundPoint[];
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

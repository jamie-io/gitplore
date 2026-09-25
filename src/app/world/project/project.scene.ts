import { Vector3 } from 'three';
import type { ShotPose } from '@engine/camera/camera-shot';
import { Interactable } from '@engine/interaction/interactable';
import type { InputActionSource } from '@engine/input.service';
import { Collider } from '@engine/player/collision';
import { PlayerController } from '@engine/player/player-controller';
import { PlayerVisual } from '@engine/player/player-visual';
import type {
  GroundPoint,
  ScenePitch,
  StationPlate,
  StationSpec,
  StationStand,
} from '@engine/stations/station';
import { WorldContext, WorldObject, WorldScene } from '@engine/world-object';
import type { Project } from '@content/project.model';
import { Explorer } from '../avatar/explorer';
import { Environment, ToyLayout } from '../environments/environment';
import { CommitRidge } from '../environments/data/commit-ridge';
import { LanguagePillars, languageSideOffset } from '../environments/data/language-pillars';
import { ReleaseMarkers } from '../environments/data/release-markers';
import { StarLanterns } from '../environments/data/star-lanterns';
import { ExhibitEasel } from '../environments/props/exhibit-easel';
import { SeedLever } from '../environments/props/seed-lever';
import { Terminal } from '../environments/props/terminal';
import { HazedCopies } from '../environments/shaders/hazed-copies';
import { Landmark, LandmarkPlacement, TextureProvider } from '../landmarks/base/landmark';
import {
  SCREEN_CENTRE,
  ScreenLandmark,
  ScreenLandmarkOptions,
} from '../landmarks/base/screen.landmark';
import { ReturnPortal } from './return.landmark';

/** Metres from the walk's centre line to either toy: past the ridge and release cairns on one side. */
export const TOY_SIDE_OFFSET = 4.5;
/**
 * Where each toy may stand, in order of preference: a share of the walk and a side of it (+1 the
 * language pillars' side, −1 the commit ridge's). The terminal stands early and the lever late, both
 * short of or past the pillar row at the midpoint. The first spot whose footprint keeps `TOY_ROOM`
 * from everything the environment blocks wins: the Plaza's fountain, for one, fills the pillar
 * side of the early walk, so its terminal crosses to the other side.
 */
export const TERMINAL_SPOTS: readonly (readonly [along: number, side: 1 | -1])[] = [
  [0.3, 1],
  [0.25, 1],
  [0.35, 1],
  [0.3, -1],
  [0.25, -1],
  [0.35, -1],
];
export const LEVER_SPOTS: readonly (readonly [along: number, side: 1 | -1])[] = [
  [0.7, -1],
  [0.75, -1],
  [0.65, -1],
  [0.7, 1],
  [0.75, 1],
];
/** Radius around a toy's centre that holds its whole footprint: half the terminal's width. */
const TOY_REACH = 1.35;
const TOY_ROOM = 1;

export interface ToyPlacement {
  readonly position: Vector3;
  /** Exhibit convention: 0 faces +Z. */
  readonly rotationY: number;
}

/** What the exhibit poster adds to the project's own copy, for a world that has more to say. */
export type PosterCopy = Pick<
  ScreenLandmarkOptions,
  'kicker' | 'englishSummary' | 'comparison' | 'prompt'
>;

/**
 * Where the terminal and the seed lever stand: beside the walk from the arrival point to the
 * exhibit, never on it, each turned to face the walk and the visitor coming along it. The ridge and the
 * release cairns keep within about 3.3 m of the centre line and the pillar row stands at the walk's
 * midpoint, so both toys stay clear of them. Deterministic: the same world always puts them in the
 * same place.
 */
export function toyPlacements(
  arrival: Vector3,
  exhibit: Vector3,
  blocked: readonly Collider[],
): { readonly terminal: ToyPlacement; readonly lever: ToyPlacement } {
  const axis = new Vector3(exhibit.x - arrival.x, 0, exhibit.z - arrival.z);
  const length = axis.length();
  if (length > 0) {
    axis.divideScalar(length);
  } else {
    axis.set(0, 0, -1);
  }
  // The same side vector the commit ridge and the release markers use; they stand on its minus side.
  const side = new Vector3(-axis.z, 0, axis.x);
  const place = (along: number, sign: number): ToyPlacement => {
    const position = arrival
      .clone()
      .setY(0)
      .addScaledVector(axis, length * along)
      .addScaledVector(side, sign * TOY_SIDE_OFFSET);
    // Face back across the walk and a little towards the arrival point.
    const front = side.clone().multiplyScalar(-sign).addScaledVector(axis, -0.6);
    return { position, rotationY: Math.atan2(front.x, front.z) };
  };
  const first = (candidates: readonly (readonly [number, number])[]): ToyPlacement => {
    const spots = candidates.map(([along, sign]) => place(along, sign));
    return (
      spots.find((spot) => gap(spot.position.x, spot.position.z, blocked) > TOY_REACH + TOY_ROOM) ??
      spots[0]
    );
  };
  return { terminal: first(TERMINAL_SPOTS), lever: first(LEVER_SPOTS) };
}

/** Metres from (x, z) to the nearest collider's surface. */
function gap(x: number, z: number, colliders: readonly Collider[]): number {
  let nearest = Infinity;
  for (const collider of colliders) {
    const distance =
      collider.kind === 'cylinder'
        ? Math.hypot(x - collider.x, z - collider.z) - collider.radius
        : Math.hypot(
            Math.max(collider.minX - x, 0, x - collider.maxX),
            Math.max(collider.minZ - z, 0, z - collider.maxZ),
          );
    nearest = Math.min(nearest, distance);
  }
  return nearest;
}

/** Anything a project scene owns: it may block, it may offer, and it is disposed with the scene. */
export interface SceneObject extends WorldObject {
  readonly colliders?: readonly Collider[];
  readonly interactables?: readonly Interactable[];
}

/**
 * A demo the visitor plays inside the world rather than in the panel (§5's "in-world" demo mode).
 * The scene owns it; the `SceneDirector` drives it, which is why it is not a `Landmark` any more —
 * a demo is a thing you use, not a place you walk to.
 */
export interface InWorldDemo {
  /**
   * `captured` (the default) hands the demo the controls until Esc, and the HUD shows its hint;
   * `world` only calls `enter`, which sets the world up for the visitor, and leaves them walking.
   */
  readonly mode?: 'captured' | 'world';
  /** What the HUD tells the visitor while the demo runs. */
  readonly demoHint: string;
  enter(player: PlayerController): void;
  interact(): void;
  exit(): void;
}

export interface ProjectSceneOptions {
  readonly environment: Environment;
  readonly project: Project;
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
  /** The exhibit was used; the page turns this into the `/p/:slug/info` route. */
  readonly onOpenInfo: (project: Project) => void;
  /** The return portal was used; the page turns this into `/`. */
  readonly onLeave: () => void;
  /** The visitor asked to start this world's in-world demo; the director hands it the controls. */
  readonly onDemo?: () => void;
  /** Captured controls for the terminal; omitted by headless scene specs. */
  readonly input?: InputActionSource;
  readonly textures?: TextureProvider;
  /** Extra copy for the exhibit poster; a bespoke scene passes its own. */
  readonly poster?: PosterCopy;
  /**
   * A short line of world state for the HUD, e.g. `Deslopify an · Entslopt 8/8`, written only when
   * it changes; `null` clears it. Only worlds with a state of their own write it.
   */
  readonly onStatus?: (status: string | null) => void;
  /** A passing line for the HUD, e.g. a lantern lit; the director clears it after a moment. */
  readonly onToast?: (text: string) => void;
  /**
   * The world's key moment has happened: the director plays the moment camera over the overview
   * and shows `banner` for as long as it runs. Only worlds with an `overview` have one.
   */
  readonly onMoment?: (banner: string) => void;
}

/**
 * One repository's own world (spec §5): the environment carries the atmosphere, the exhibit board
 * carries the screenshot and opens the panel, and the return portal leads back to the start world.
 *
 * Bespoke scenes under `world/projects/<slug>/` extend this and call `add()` in their constructor;
 * everything else about them is inherited.
 */
export class ProjectScene implements WorldScene {
  readonly id: string;
  readonly landmarks: readonly Landmark[];
  /** Where the director puts the player on arrival, and which way they look. */
  readonly arrival: { readonly position: Vector3; readonly yaw: number };

  /**
   * Built with the world and disposed with it, cut from this environment's own accent. Protected
   * so a bespoke scene can hand the explorer something to carry.
   */
  protected readonly explorer: Explorer;

  protected readonly environment: Environment;
  protected readonly project: Project;
  protected readonly returnPortal: ReturnPortal;
  protected readonly exhibit: ScreenLandmark;
  /** The two toys every project world gets; public so specs can find them. */
  readonly terminal: Terminal;
  /** `null` for an environment whose `toyLayout()` lays out no lever, the Plaza among them. */
  readonly seedLever: SeedLever | null;
  /** The star lanterns, or in the jungle the firefly swarm a bespoke scene steers. */
  protected readonly starLanterns: StarLanterns;
  /** Hazed copies of loaded models' materials, where the environment has an atmosphere to share. */
  protected readonly haze: HazedCopies | null;

  private readonly parts: SceneObject[];
  private cachedColliders: readonly Collider[] | null = null;
  private cachedInteractables: readonly Interactable[] | null = null;

  constructor(options: ProjectSceneOptions) {
    this.environment = options.environment;
    this.project = options.project;
    this.haze = options.environment.shared ? new HazedCopies(options.environment.shared) : null;
    this.id = `project:${options.project.slug}`;
    this.explorer = new Explorer({
      mood: options.environment.mood,
      reducedMotion: options.reducedMotion,
    });

    // The Plaza stands its notice board around the exhibit and its street arch around the portal,
    // so neither landmark draws its own frame there.
    const plaza = this.environment.id === 'plaza';
    const [anchor] = this.environment.anchors(1);
    this.exhibit = new ScreenLandmark({
      project: options.project,
      placement: anchor,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: options.onOpenInfo,
      textures: options.textures,
      ...options.poster,
      frame: !plaza,
    });

    // Turned to face the arriving player's back: `Landmark` then derives a spawn point a few
    // metres in front of it and a yaw pointing away, which is exactly "the exit is behind you".
    // `Landmark.spawnYaw` already adds one `Math.PI` to `rotationY`; subtracting it here (rather
    // than adding, which `sin`/`cos` would make physically identical but numerically 2π off)
    // keeps `arrival.yaw` exactly equal to `environment.spawnYaw` instead of `+ 2π`. An environment
    // may stand it further back instead, facing the spawn from behind (the jungle's niche in the
    // rim), so it is neither underfoot nor in front of the arrival's cameras.
    const back: LandmarkPlacement = this.environment.returnPortal ?? {
      position: [this.environment.spawn.x, 0, this.environment.spawn.z],
      rotationY: this.environment.spawnYaw - Math.PI,
    };
    this.returnPortal = new ReturnPortal({
      project: options.project,
      placement: back,
      ground: this.environment.ground,
      reducedMotion: options.reducedMotion,
      onEnter: () => options.onLeave(),
      textures: options.textures,
      frame: !plaza,
    });

    this.arrival = { position: this.returnPortal.spawn, yaw: this.returnPortal.spawnYaw };
    this.landmarks = [this.exhibit, this.returnPortal];
    const toys = this.environment.toyLayout?.() ?? this.walkLayout(options.project);
    // The jungle dresses the shared toys in its own materials, and the Plaza the terminal, the ridge
    // and the language row in its own models; every other world keeps the default.
    const skin = this.environment.id === 'jungle' ? 'jungle' : undefined;
    const modelSkin = plaza ? 'plaza' : skin;
    this.terminal = new Terminal({
      id: `${this.id}:terminal`,
      position: toys.terminal.position,
      rotationY: toys.terminal.rotationY,
      ground: this.environment.ground,
      project: options.project,
      input: options.input,
      skin: modelSkin,
      haze: this.haze ?? undefined,
    });
    this.seedLever = toys.lever
      ? new SeedLever({
          id: `${this.id}:seed-lever`,
          position: toys.lever.position,
          rotationY: toys.lever.rotationY,
          ground: this.environment.ground,
          onReseed: (o) => this.reseed(o),
          reducedMotion: options.reducedMotion,
          skin,
          haze: this.haze ?? undefined,
        })
      : null;
    this.starLanterns = new StarLanterns({
      project: options.project,
      from: toys.stars.from,
      to: toys.stars.to,
      reducedMotion: options.reducedMotion,
      skin,
      ground: this.environment.ground,
    });
    this.parts = [
      this.terminal,
      ...(this.seedLever ? [this.seedLever] : []),
      this.exhibit,
      this.returnPortal,
      // The jungle stands its exhibit in a timber easel; everywhere else it stands on its post.
      ...(skin === 'jungle'
        ? [
            new ExhibitEasel({
              position: this.exhibit.position,
              rotationY: this.exhibit.rotationY,
              screenCentre: SCREEN_CENTRE,
              haze: this.haze ?? undefined,
            }),
          ]
        : []),
      ...(toys.ridge
        ? [
            new CommitRidge({
              project: options.project,
              from: toys.ridge.from,
              to: toys.ridge.to,
              ground: this.environment.ground,
              skin: modelSkin,
              haze: this.haze ?? undefined,
              reducedMotion: options.reducedMotion,
            }),
          ]
        : []),
      new LanguagePillars({
        project: options.project,
        origin: toys.languages.position,
        rotationY: toys.languages.rotationY,
        stalks: toys.languages.stalks,
        ground: this.environment.ground,
        skin: modelSkin,
        haze: this.haze ?? undefined,
      }),
      new ReleaseMarkers({
        project: options.project,
        from: toys.releases.from,
        to: toys.releases.to,
        ground: this.environment.ground,
        skin,
        haze: this.haze ?? undefined,
      }),
      this.starLanterns,
    ];
  }

  /**
   * The toys along the straight walk from the arrival to the exhibit, for every environment that
   * does not lay them out itself: the terminal and the lever beside it, the ridge, the cairns and
   * the lanterns along it, and the language row across its midpoint on its own side.
   */
  private walkLayout(project: Project): ToyLayout {
    const { terminal, lever } = toyPlacements(
      this.arrival.position,
      this.exhibit.position,
      this.environment.colliders,
    );
    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );
    const walk = { from: this.arrival.position, to: this.exhibit.position };
    return {
      terminal,
      lever,
      ridge: walk,
      languages: {
        position: this.arrival.position
          .clone()
          .lerp(this.exhibit.position, 0.5)
          .addScaledVector(side, languageSideOffset(project)),
        rotationY: this.exhibit.rotationY,
      },
      releases: walk,
      stars: walk,
    };
  }

  /**
   * The in-world demo this world offers, if it has one. A getter rather than a field so a bespoke
   * scene can override it without depending on the order class fields are initialised in: a
   * subclass (Task 6's DeslopifyScene) overrides it with its own `get demo()`, which a field on
   * this base class cannot be safely replaced by.
   */
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get demo(): InWorldDemo | null {
    return null;
  }

  /*
   * The stations, the stands, the shots and the plates the director reads (spec §2, §3). A plain
   * project world has none of them; a bespoke scene overrides the getters, and defines the two
   * methods, to have them. Getters, not fields, for the same reason as `demo`.
   */

  /** The stops of the station bar, in order; none in a plain project world. */
  get stations(): readonly StationSpec[] | undefined {
    return undefined;
  }

  /** Where the 0 key glides to. */
  get portalStand(): StationStand | undefined {
    return undefined;
  }

  /** The pose that frames the whole world, for the arrival camera and the key moment. */
  get overview(): ShotPose | undefined {
    return undefined;
  }

  /** The project's name and one line, over the arrival camera. */
  get pitch(): ScenePitch | undefined {
    return undefined;
  }

  /** The way a glide takes between two spots; a straight line where a scene does not say. */
  glidePath?(from: GroundPoint, to: GroundPoint): readonly GroundPoint[];

  /** The plate for a find at (x, z) that is not a station. */
  plateAt?(x: number, z: number): StationPlate | null;

  /**
   * The seed lever was pulled for the `offset`-th time: the environment scatters its decoration
   * anew. A bespoke scene may add its own answer to the pull, such as the jungle's fireflies.
   */
  protected reseed(offset: number): void {
    this.environment.reseedDecoration?.(offset);
  }

  /** Adds a bespoke object. Call from a subclass constructor only: shapes are read after that. */
  protected add(object: SceneObject): void {
    this.parts.push(object);
    this.cachedColliders = null;
    this.cachedInteractables = null;
  }

  /** The engine drives the figure through `PlayerVisual` alone and never names the Explorer. */
  get avatar(): PlayerVisual {
    return this.explorer;
  }

  get ground() {
    return this.environment.ground;
  }

  // Cached rather than recomputed: the render loop reads both every frame, and rebuilding two
  // arrays per frame would allocate for nothing. `add` clears the cache.
  get colliders(): readonly Collider[] {
    return (this.cachedColliders ??= [
      ...this.environment.colliders,
      ...this.parts.flatMap((part) => part.colliders ?? []),
    ]);
  }

  get interactables(): readonly Interactable[] {
    return (this.cachedInteractables ??= [
      ...(this.environment.interactables ?? []),
      ...this.parts.flatMap((part) => part.interactables ?? []),
    ]);
  }

  init(ctx: WorldContext): void {
    this.environment.init(ctx);
    this.parts.forEach((part) => part.init(ctx));
    this.explorer.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.environment.update(dt, ctx);
    this.parts.forEach((part) => part.update(dt, ctx));
  }

  dispose(): void {
    this.parts.forEach((part) => part.dispose());
    this.haze?.dispose();
    this.explorer.dispose();
    this.environment.dispose();
  }
}

import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  Vector3,
} from 'three';
import { QualitySettings, QualityTier } from '@engine/capability.service';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Backdrop } from './backdrop';
import type { EnvironmentOptions } from './create-environment';
import { MARKER_OFFSET } from './data/release-markers';
import { Anchor, Environment, ToyLayout, ToyLine, ToySpot } from './environment';
import {
  CLIFF_LIP,
  cliffWall,
  kapokTree,
  leafCluster,
  liana,
  mossyBoulder,
  palmTree,
  treeFern,
} from './flora';
import { ProceduralGround } from './ground';
import { JungleBridge } from './jungle-bridge';
import {
  ARCH,
  BAMBOO,
  BRIDGE,
  BRIDGE_NORTH,
  BROOK,
  CAIRNS,
  CARD_SLOTS,
  CAVE,
  CLIFF,
  EXHIBIT,
  LANTERN_POST,
  LIANA,
  NORTH_TRAIL,
  PATHS,
  POOL,
  RIDGE,
  SPAWN,
  STELE,
  STREAM,
  STREAM_REACH,
  Slot,
  WALL_SLOT,
  WATER_LEVEL,
  distanceToBrook,
  distanceToStream,
  jungleHeightAt,
  mapToWorld,
  nearestOnPath,
  pointAlong,
  streamCentreZ,
} from './jungle-layout';
import { HIDDEN_PLACE_SHELL, HiddenPlace } from './props/hidden-place';
import { LightShafts } from './light-shafts';
import { DSCHUNGEL, applyMood, clearMood } from './mood';
import { Motes } from './motes';
import { Random, between, seededRandom, valueNoise } from './random';
import {
  Exclusion,
  Placement,
  buildInstanced,
  cylinderColliders,
  foliageTint,
  isExcluded,
  scatter,
  stoneTint,
  variants,
} from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { withDapple } from './shaders/dapple';
import { withFoliage } from './shaders/foliage';
import { withGroundDetail } from './shaders/ground-detail';
import { SharedUniforms } from './shaders/shared-uniforms';
import { withWind } from './shaders/wind';
import { Sky } from './sky';
import { Sun } from './sun';
import { Water } from './water';
import { Waterfall } from './waterfall';

/** Edge length of the floor: the whole layout, from the cliff's back to 40 m behind the arrival. */
const SIZE = 200;
/** Grid cells along an edge: 1.3 m apart, fine enough to model the stream's banks. */
const SEGMENTS = 150;

export { CAVE, POOL, jungleHeightAt };

/** Keep the visual pool full-sized while leaving a capsule-width approach to the waterfall. */
const POOL_COLLIDER_RADIUS = POOL.radius * 0.7;

/** The pool's water line, which the stream and the brook share. */
export const POOL_LEVEL = WATER_LEVEL;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A polyline as segment exclusions `halfWidth` either side of it. */
function along(path: readonly Vector3[], halfWidth: number): Exclusion[] {
  return path.slice(1).map((point, i) => ({
    kind: 'segment' as const,
    ax: path[i].x,
    az: path[i].z,
    bx: point.x,
    bz: point.z,
    halfWidth,
  }));
}

/** The stream's centre line, sampled every 4 m across the jungle. */
const STREAM_LINE: readonly Vector3[] = Array.from(
  { length: (STREAM_REACH.east - STREAM_REACH.west) / 4 + 1 },
  (_, i) => {
    const x = STREAM_REACH.west + i * 4;
    return new Vector3(x, 0, streamCentreZ(x));
  },
);

/** Everything the flow furnishes that stands on the ground, with the room it needs. */
const FURNITURE: readonly Exclusion[] = [
  { kind: 'circle', x: LANTERN_POST.x, z: LANTERN_POST.z, radius: 2.5 },
  ...CARD_SLOTS.map(({ position }) => ({
    kind: 'circle' as const,
    x: position.x,
    z: position.z,
    radius: 2.2,
  })),
  { kind: 'circle', x: STELE.position.x, z: STELE.position.z, radius: 2.5 },
  { kind: 'circle', x: BAMBOO.position.x, z: BAMBOO.position.z, radius: 3.5 },
  { kind: 'circle', x: CAIRNS.position.x, z: CAIRNS.position.z, radius: 3.5 },
  { kind: 'circle', x: LIANA.position.x, z: LIANA.position.z, radius: 2 },
  { kind: 'circle', x: EXHIBIT.position.x, z: EXHIBIT.position.z, radius: 3 },
  // The feed wall stands four cards wide across its slot.
  sideways(WALL_SLOT, 6, 2.5),
];

/** A segment `reach` either side of a slot, square to the way it faces. */
function sideways(place: Slot, reach: number, halfWidth: number): Exclusion {
  const across = [Math.cos(place.yaw), -Math.sin(place.yaw)];
  return {
    kind: 'segment',
    ax: place.position.x - across[0] * reach,
    az: place.position.z - across[1] * reach,
    bx: place.position.x + across[0] * reach,
    bz: place.position.z + across[1] * reach,
    halfWidth,
  };
}

/**
 * Where exhibits may stand, all on the north bank and turned to the bridge: the first is the map's
 * exhibit poster, the rest spare spots at least 9 m from it and from each other.
 */
const LANDMARK_SPOTS: readonly Slot[] = [
  EXHIBIT,
  ...(
    [
      [620, 230],
      [430, 112],
      [260, 215],
    ] as const
  ).map(([x, y]) => {
    const position = mapToWorld(x, y);
    return {
      position,
      yaw: Math.atan2(BRIDGE_NORTH.x - position.x, BRIDGE_NORTH.z - position.z),
    };
  }),
];

/**
 * Where nothing tall stands: the arrival, a corridor along every trail, the stream and the brook
 * with their banks, room around everything the flow stands along the trails, 6.5 m either side
 * of the exhibit for its wall, and the view from the bridge to the falls.
 */
export const STAGE: readonly Exclusion[] = [
  { kind: 'circle', x: SPAWN.position.x, z: SPAWN.position.z, radius: 7 },
  ...PATHS.flatMap((path) => along(path, 4.5)),
  ...along(STREAM_LINE, STREAM.halfWidth + 2.5),
  ...along(BROOK.path, BROOK.halfWidth + 2),
  ...FURNITURE.map((zone) =>
    zone.kind === 'circle' ? { ...zone, radius: zone.radius + 2.5 } : zone,
  ),
  ...LANDMARK_SPOTS.map((spot) => sideways(spot, 8, 5.5)),
  sideways(WALL_SLOT, 8, 5.5),
  { kind: 'segment', ax: BRIDGE_NORTH.x, az: BRIDGE_NORTH.z, bx: POOL.x, bz: POOL.z, halfWidth: 6 },
];

/** The cliff's foot and the pool's edge. */
const ROCK: readonly Exclusion[] = [
  {
    kind: 'segment',
    ax: CLIFF.x - CLIFF.width / 2 - 2,
    az: CLIFF.z,
    bx: CLIFF.x + CLIFF.width / 2 + 2,
    bz: CLIFF.z,
    halfWidth: 6,
  },
  { kind: 'circle', x: POOL.x, z: POOL.z, radius: POOL.radius + 2.5 },
];

/**
 * Where even the undergrowth stays out: the arrival point, the trodden trails and the deck, the
 * water itself, the footprints of everything the flow stands, the cliff and the pool.
 */
export const STAGE_FLOOR: readonly Exclusion[] = [
  { kind: 'circle', x: SPAWN.position.x, z: SPAWN.position.z, radius: 3.5 },
  ...PATHS.flatMap((path) => along(path, 1.6)),
  ...along(STREAM_LINE, STREAM.halfWidth + 0.3),
  ...along(BROOK.path, BROOK.halfWidth + 0.3),
  ...FURNITURE,
  { kind: 'circle', x: POOL.x, z: POOL.z, radius: POOL.radius + 0.5 },
  ROCK[0],
];

/** Metres from the middle of the floor that the groves spread over. */
const GROVE_REACH = 88;

/** The stream's and the brook's water: the map's #4f8b93 over the shallows, its #8cc3c8 edge as foam. */
const STREAM_COLOURS = { shallow: 0x4f8b93, deep: 0x163c3e, foam: 0x8cc3c8 } as const;
/** The stream and the brook run under the canopy: they mirror leaves more than the pale sky. */
const STREAM_REFLECTION = 0.35;
const STREAM_PATH = STREAM_LINE.map((point) => [point.x, point.z] as const);

/**
 * The water no one walks into. The stream is a row of boxes 4 m long, each as deep as the band
 * either side of the centre line over its length, with the deck's width left open between them;
 * the brook is a chain of discs close enough to overlap, from inside the pool's collider down into
 * the stream's band. Together with the jungle's edge they close the north bank off from the south
 * everywhere but the bridge.
 */
function waterColliders(): Collider[] {
  const colliders: Collider[] = [];
  const span = (from: number, to: number) => {
    for (let x = from; x < to - 1e-9; x += 4) {
      const end = Math.min(x + 4, to);
      let low = Infinity;
      let high = -Infinity;
      for (let sample = x; sample < end + 0.25; sample += 0.5) {
        const centre = streamCentreZ(Math.min(sample, end));
        low = Math.min(low, centre);
        high = Math.max(high, centre);
      }
      colliders.push({
        kind: 'aabb',
        minX: x,
        maxX: end,
        minZ: low - STREAM.band,
        maxZ: high + STREAM.band,
      });
    }
  };
  span(STREAM_REACH.west, BRIDGE.centre.x - BRIDGE.halfWidth);
  span(BRIDGE.centre.x + BRIDGE.halfWidth, STREAM_REACH.east);

  const spacing = BROOK.band * 0.8;
  for (let i = 0; i < BROOK.path.length - 1; i++) {
    const a = BROOK.path[i];
    const b = BROOK.path[i + 1];
    const steps = Math.ceil(a.distanceTo(b) / spacing);
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      colliders.push({
        kind: 'cylinder',
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        radius: BROOK.band,
      });
    }
  }
  const mouth = BROOK.path[BROOK.path.length - 1];
  colliders.push({ kind: 'cylinder', x: mouth.x, z: mouth.z, radius: BROOK.band });
  return colliders;
}

const WATER_COLLIDERS: readonly Collider[] = waterColliders();

/**
 * The jungle's edge, too thick to push through: walls on every side a few metres inside the
 * floor's edge (behind the cliff to the north), which the stream's ends run into.
 */
const EDGE = { west: -88, east: 88, south: 88, north: -64 } as const;
const OUTSIDE = SIZE / 2 + 20;
const BOUNDS: readonly Collider[] = [
  { kind: 'aabb', minX: -OUTSIDE, maxX: EDGE.west, minZ: -OUTSIDE, maxZ: OUTSIDE },
  { kind: 'aabb', minX: EDGE.east, maxX: OUTSIDE, minZ: -OUTSIDE, maxZ: OUTSIDE },
  { kind: 'aabb', minX: -OUTSIDE, maxX: OUTSIDE, minZ: EDGE.south, maxZ: OUTSIDE },
  { kind: 'aabb', minX: -OUTSIDE, maxX: OUTSIDE, minZ: -OUTSIDE, maxZ: EDGE.north },
];

/**
 * The leaf clusters on the floor and hung overhead, per tier, and how much sun shines through a
 * leaf seen against it. Instanced, so the counts cost two draw calls whatever they are.
 */
export const FOLIAGE: Readonly<
  Record<
    QualityTier,
    { readonly plants: number; readonly canopy: number; readonly translucency: number }
  >
> = {
  low: { plants: 320, canopy: 40, translucency: 0 },
  medium: { plants: 900, canopy: 110, translucency: 0.7 },
  high: { plants: 1400, canopy: 200, translucency: 1.1 },
};
/** `QualitySettings` names no tier; its shader detail is 0, 1 and 2 on the three of them. */
const TIER_BY_DETAIL: readonly QualityTier[] = ['low', 'medium', 'high'];
const LEAF_GREENS: readonly number[] = [0x3f7a34, 0x4f8a3a, 0x2f6a36, 0x5d8f3c, 0x356f45];
/**
 * Plants stand along the walked lines, this far either side: the haze has swallowed anything
 * further out, so spending them there would thin the undergrowth the visitor walks through.
 */
const PLANT_REACH = 20;
/** Canopy clusters hang over the walked lines, this far either side. */
const CANOPY_REACH = 18;
/**
 * Where no canopy hangs: over the stream either side of the bridge, so the water and the arch
 * stand in open light, across the view from the bridge to the falls, over the pool, and against
 * the cliff.
 */
const OPEN_SKY: readonly Exclusion[] = [
  {
    kind: 'segment',
    ax: BRIDGE.centre.x - 14,
    az: BRIDGE.centre.z,
    bx: BRIDGE.centre.x + 14,
    bz: BRIDGE.centre.z,
    halfWidth: 7,
  },
  { kind: 'segment', ax: BRIDGE_NORTH.x, az: BRIDGE_NORTH.z, bx: POOL.x, bz: POOL.z, halfWidth: 6 },
  ...ROCK,
];
/** Metres between the ground and a canopy cluster's lowest leaf, well over the camera. */
const CANOPY_CLEARANCE = 4.2;
/** How far a cluster hung upside down reaches below its root, in leaf-cluster heights at scale 1. */
const CANOPY_DROOP = 1.3;
/**
 * Metres a shadow lookup moves out along the normal: the Lookdev's 3 cm rather than the other
 * worlds' 5, so plants' shadows stay attached at their bases. The smooth floor takes it without
 * acne even on the medium tier's coarse texels, because this sun stands 60° high over gentle relief.
 */
export const JUNGLE_SHADOW_NORMAL_BIAS = 0.03;

const MOSS = new Color(0x3f6230);
const MOSS_LIT = new Color(0x5a7f38);
const HOLLOW = new Color(0x26371f);
const LITTER = new Color(0x5c4a31);
const TRAIL = new Color(0x6a5840);
const SILT = new Color(0x4a4a38);
const scratch = new Color();

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Metres from (x, z) to the nearest walked line. */
function toTrail(x: number, z: number): number {
  return Math.min(...PATHS.map((path) => nearestOnPath(x, z, path).distance));
}

/**
 * The forest floor at one corner: moss, leaf litter, the trodden trails and the deck's
 * approaches, and silt along the water.
 */
export function jungleGround(x: number, z: number, height: number): Color {
  scratch
    .copy(HOLLOW)
    .lerp(MOSS, clamp01((height + 1.5) / 2.5))
    .lerp(MOSS_LIT, clamp01(valueNoise(x * 0.08, z * 0.08, 5) - 0.45) * 1.2);
  const litter = valueNoise(x * 0.3, z * 0.3, 6);
  if (litter > 0.6) {
    scratch.lerp(LITTER, (litter - 0.6) * 1.8);
  }
  const toPool = Math.hypot(x - POOL.x, z - POOL.z);
  if (toPool < POOL.radius * 1.3) {
    scratch.lerp(SILT, clamp01((POOL.radius * 1.3 - toPool) / (POOL.radius * 0.4)));
  }
  const shore = Math.min(
    distanceToStream(x, z) - STREAM.halfWidth,
    distanceToBrook(x, z) - BROOK.halfWidth,
  );
  if (shore < 1.8) {
    scratch.lerp(SILT, clamp01((1.8 - shore) / 1.2));
  }
  const trail = toTrail(x, z);
  if (trail < 1.4) {
    scratch.lerp(TRAIL, (1 - trail / 1.4) * 0.8);
  }
  return scratch;
}

/**
 * The violet air the slop brings (Turn 2's south bank): DSCHUNGEL's fog, light and sky pulled
 * towards the slop colour #9a3f8d, the fog closer and thicker. `setSlop` blends between the two.
 */
export const SLOP_AIR = {
  fog: { color: 0x86608e, near: 3, far: 55, heightDensity: 0.075 },
  hemisphere: { sky: 0xb898c6, ground: 0x3b2a3c },
  sun: 0xf2d4ec,
  sky: { zenith: 0x5c5078, horizon: 0x9a7c9f, below: 0x4a3a52 },
} as const;

/** How much of the slop's haze still hangs over the north bank: it thins over the span. */
export const NORTH_BANK_HAZE = 0.35;

/** Linear-space copies of both ends of the slop blend, made once. */
const CLEAR = {
  fog: new Color(DSCHUNGEL.fog.color),
  hemisphereSky: new Color(DSCHUNGEL.hemisphere.sky),
  hemisphereGround: new Color(DSCHUNGEL.hemisphere.ground),
  sun: new Color(DSCHUNGEL.sun.color),
  zenith: new Color(DSCHUNGEL.sky.zenith),
  horizon: new Color(DSCHUNGEL.sky.horizon),
  below: new Color(DSCHUNGEL.sky.below),
} as const;
const SLOPPED = {
  fog: new Color(SLOP_AIR.fog.color),
  hemisphereSky: new Color(SLOP_AIR.hemisphere.sky),
  hemisphereGround: new Color(SLOP_AIR.hemisphere.ground),
  sun: new Color(SLOP_AIR.sun),
  zenith: new Color(SLOP_AIR.sky.zenith),
  horizon: new Color(SLOP_AIR.sky.horizon),
  below: new Color(SLOP_AIR.sky.below),
} as const;

/** The things the slop tints, found once the kit objects have built them. */
interface Air {
  readonly fog: Fog;
  /** The fog's far distance on this tier, clear of slop. */
  readonly far: number;
  readonly background: Color | null;
  readonly sun: DirectionalLight;
  readonly hemisphere: HemisphereLight | null;
  readonly sky: ShaderMaterial | null;
}

/**
 * Dense, close, humid: rainforest giants whose canopy closes overhead, palms and tree ferns, light
 * falling in shafts through the haze, and a waterfall behind the stage — the world behind a portal
 * that should feel like undergrowth.
 *
 * Laid out as Deslopify's two banks (`jungle-layout.ts`): the arrival and its winding trail on the
 * south bank, a stream across the clearing that only the bridge under the arch crosses, and the
 * exhibit, the feed wall and the cave behind the falls on the north bank.
 */
export class JungleEnvironment implements Environment {
  readonly id = 'jungle' as const;
  readonly name = 'Dschungel';
  /** The trail's south end, where the return portal stands; arrivals face along the trail. */
  readonly spawn = new Vector3(
    SPAWN.position.x,
    jungleHeightAt(SPAWN.position.x, SPAWN.position.z),
    SPAWN.position.z,
  );
  /** The engine's yaw looks down −Z at 0, the opposite of a slot's; this faces along the trail. */
  readonly spawnYaw = SPAWN.yaw + Math.PI;
  /** The light and air of this place; the scene reads it to match whatever stands in it. */
  readonly mood = DSCHUNGEL;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(DSCHUNGEL);
  /**
   * The clearing Deslopify spreads, as uniforms any material can take by identity: the ring's
   * centre in world space (`uClearOrigin`) and its radius in metres (`uClearRadius`). The flow
   * writes them; the ring starts at the arch with nothing cleared.
   */
  readonly clearing = {
    origin: { value: ARCH.clone() },
    radius: { value: 0 },
  };
  readonly colliders: readonly Collider[];
  /** A nook behind the waterfall. It holds a stone and nothing else: no text, no tally. */
  readonly cave: HiddenPlace;
  readonly interactables: readonly Interactable[];
  /** The way over the stream, and the arch on it. */
  readonly bridge: JungleBridge;

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: SEGMENTS,
    heightAt: jungleHeightAt,
    colorAt: jungleGround,
    decorate: (material, quality) =>
      void withGroundDetail(
        withDapple(withAtmosphere(material, this.shared), this.shared, 0.75),
        quality.shaderDetail,
      ),
  });
  private readonly cliffBase = jungleHeightAt(CLIFF.x, CLIFF.z);
  private readonly lipHeight = this.cliffBase + CLIFF.height * CLIFF_LIP;
  private readonly sky = new Sky({ mood: DSCHUNGEL, shared: this.shared });
  private readonly sun = new Sun({
    mood: DSCHUNGEL,
    shared: this.shared,
    normalBias: JUNGLE_SHADOW_NORMAL_BIAS,
  });
  private readonly pool = new Water({
    shared: this.shared,
    mood: DSCHUNGEL,
    centre: [POOL.x, POOL.z],
    radius: POOL.radius,
    level: WATER_LEVEL,
    ground: this.floor,
    colours: { shallow: 0x6fa89a, deep: 0x1f4a45, foam: 0xf0fff8 },
    bankFog: true,
  });
  /** The stream, drawn a little past its banks: the depth fade hides what the bank covers. */
  private readonly stream = new Water({
    shared: this.shared,
    mood: DSCHUNGEL,
    path: STREAM_PATH,
    halfWidth: STREAM.halfWidth + 0.6,
    level: WATER_LEVEL,
    ground: this.floor,
    colours: STREAM_COLOURS,
    reflection: STREAM_REFLECTION,
    bankFog: true,
    flow: [-0.45, 0],
  });
  private readonly brook = new Water({
    shared: this.shared,
    mood: DSCHUNGEL,
    path: BROOK.path.map((point) => [point.x, point.z] as const),
    halfWidth: BROOK.halfWidth + 0.5,
    level: WATER_LEVEL,
    ground: this.floor,
    colours: STREAM_COLOURS,
    reflection: STREAM_REFLECTION,
    bankFog: true,
  });
  private readonly waterfall = new Waterfall({
    shared: this.shared,
    mood: DSCHUNGEL,
    lip: [POOL.x, this.lipHeight, CLIFF.z + 2],
    width: 4.5,
    drop: this.lipHeight - WATER_LEVEL,
    rotationY: 0,
    colours: { water: 0xcfeee6, foam: 0xffffff },
  });
  private readonly shafts = new LightShafts({
    shared: this.shared,
    colour: 0xf2ffd0,
    intensity: 2,
    shafts: [
      // One on the bridge, so the arch stands in light, and the rest along the trails.
      { x: BRIDGE.centre.x, z: BRIDGE.centre.z, radius: 2.2, height: 30 },
      { x: LANTERN_POST.x + 3, z: LANTERN_POST.z - 2, radius: 1.6, height: 30 },
      { x: -12, z: 34, radius: 1.3, height: 30 },
      { x: -6, z: 23, radius: 2.0, height: 30 },
      { x: 3, z: 9, radius: 1.4, height: 30 },
      { x: 11, z: -18, radius: 1.8, height: 30 },
      { x: -10, z: -26, radius: 1.3, height: 30 },
      { x: 24, z: -30, radius: 1.6, height: 30 },
    ],
  });
  private readonly spores = new Motes({
    shared: this.shared,
    seed: 401,
    count: 350,
    area: { x: 0, z: 0, radius: 25, minY: -1.2, maxY: 4 },
    followCamera: true,
    colour: 0xe8ffd0,
    size: 0.04,
    glow: 1.2,
    directGlow: 0.45,
    drift: 0.6,
    flicker: 0.1,
  });
  private readonly fireflies = new Motes({
    shared: this.shared,
    seed: 402,
    count: 120,
    area: { x: 0, z: 8, radius: 45, minY: 0.3, maxY: 2.2 },
    followCamera: false,
    heightAt: jungleHeightAt,
    colour: 0xd8ff7a,
    size: 0.07,
    glow: 4,
    directGlow: 1.3,
    drift: 1.5,
    flicker: 1,
  });
  /** The far hills; public so a spec can watch the slop reach them. */
  readonly backdrop = new Backdrop(
    [
      {
        radius: 125,
        depth: 60,
        height: 30,
        roughness: 0.8,
        color: 0x2f5a3a,
        haze: 0.35,
        seed: 111,
      },
      { radius: 185, depth: 80, height: 45, roughness: 0.7, color: 0x3f6a55, haze: 0.6, seed: 112 },
    ],
    DSCHUNGEL.fog.color,
  );

  /** Everything that collides, placed before `init` with counts that never depend on the tier. */
  private readonly groves: {
    readonly kapok: readonly Placement[];
    readonly palms: readonly Placement[];
    readonly ferns: readonly Placement[];
    readonly boulders: readonly Placement[];
  };
  private props: InstancedMesh[] = [];
  /** The collider-free undergrowth the seed lever scatters again; also listed in `props`. */
  private plants: InstancedMesh | null = null;
  private scene: WorldContext['scene'] | null = null;
  private air: Air | null = null;
  private slopAmount = 1;
  /** The blend last written into the air, so a still frame writes nothing. */
  private appliedHaze = -1;
  private hazeNow = 1;

  constructor(private readonly options: EnvironmentOptions) {
    const exclusions = [...STAGE, ...ROCK];
    const area = { x: 0, z: 5, inner: 0, outer: GROVE_REACH };
    this.groves = {
      kapok: scatter(
        { seed: 51, count: 24, area, scale: [0.85, 1.15], minSpacing: 9, exclusions },
        this.floor,
      ),
      palms: scatter(
        {
          seed: 52,
          count: 36,
          area,
          clusters: { count: 9, radius: 8 },
          scale: [0.85, 1.2],
          minSpacing: 4,
          exclusions,
        },
        this.floor,
      ),
      ferns: scatter(
        { seed: 53, count: 46, area, scale: [0.8, 1.3], minSpacing: 2.5, exclusions },
        this.floor,
      ),
      boulders: scatter(
        { seed: 54, count: 22, area, scale: [0.7, 1.5], minSpacing: 4, exclusions },
        this.floor,
      ),
    };

    this.cave = new HiddenPlace({
      id: 'dschungel-wasserfall-hoehle',
      position: new Vector3(CAVE.x, 0, CAVE.z),
      ground: this.floor,
      thing: new Mesh(
        new IcosahedronGeometry(0.45, 1),
        new MeshStandardMaterial({ color: 0x79a89b, roughness: 0.55, metalness: 0.15 }),
      ),
    });
    this.interactables = this.cave.interactables;
    this.bridge = new JungleBridge({ shared: this.shared });

    this.colliders = [
      // The rock face, open only between the cave's side walls and only as deep as the cave.
      {
        kind: 'aabb',
        minX: CLIFF.x - CLIFF.width / 2 - 1,
        maxX: CAVE.x - HIDDEN_PLACE_SHELL.innerWidth / 2,
        minZ: CLIFF.z - 4,
        maxZ: CLIFF.z + 2.5,
      },
      {
        kind: 'aabb',
        minX: CAVE.x + HIDDEN_PLACE_SHELL.innerWidth / 2,
        maxX: CLIFF.x + CLIFF.width / 2 + 1,
        minZ: CLIFF.z - 4,
        maxZ: CLIFF.z + 2.5,
      },
      {
        kind: 'aabb',
        minX: CAVE.x - HIDDEN_PLACE_SHELL.innerWidth / 2,
        maxX: CAVE.x + HIDDEN_PLACE_SHELL.innerWidth / 2,
        minZ: CLIFF.z - 4,
        maxZ: CAVE.z + HIDDEN_PLACE_SHELL.back,
      },
      { kind: 'cylinder', x: POOL.x, z: POOL.z, radius: POOL_COLLIDER_RADIUS },
      ...WATER_COLLIDERS,
      ...this.bridge.colliders,
      ...BOUNDS,
      ...cylinderColliders(this.groves.kapok, 0.9),
      ...cylinderColliders(this.groves.palms, 0.25),
      ...cylinderColliders(this.groves.ferns, 0.22),
      ...cylinderColliders(this.groves.boulders, 0.95),
      ...this.cave.colliders,
    ];
  }

  get ground() {
    return this.floor;
  }

  /** How much slop hangs in the air, 0 … 1, as last set. */
  get slop(): number {
    return this.slopAmount;
  }

  /**
   * The haze actually in the air this frame: the slop, thinned to `NORTH_BANK_HAZE` of itself
   * once the camera is over the north bank. It thins across the span, so the fog lifts as the
   * visitor crosses under the arch.
   */
  get haze(): number {
    return this.hazeNow;
  }

  /**
   * Blends the air between DSCHUNGEL (0) and the violet slop (1): fog colour, distance and
   * density, the sky's colours and the sun and sky light's tints. The flow drives it, easing it
   * however it likes; the jungle applies whatever it is given at once. Clamped to 0 … 1.
   */
  setSlop(value: number): void {
    this.slopAmount = clamp01(value);
  }

  /**
   * Exhibits stand on the north bank, the first where the map puts the exhibit poster, each
   * turned towards the bridge. A fixed layout: it has four spots and never honours `avoid`.
   */
  anchors(count: number): readonly Anchor[] {
    return LANDMARK_SPOTS.slice(0, count).map(({ position, yaw }) => ({
      position: [position.x, 0, position.z] as const,
      rotationY: yaw,
    }));
  }

  /**
   * The shared toys at the spots the layout keeps for them: the stele at the bridge head, the
   * liana on the north bank, the bamboo and the cairns beside the south trail, the commit ridge as
   * the boardwalk along the trail's longest leg, and the star lanterns over the north trail.
   */
  toyLayout(): ToyLayout {
    return {
      terminal: toySpot(STELE),
      lever: toySpot(LIANA),
      ridge: { from: RIDGE.from.clone(), to: RIDGE.to.clone() },
      languages: toySpot(BAMBOO),
      releases: cairnLine(CAIRNS),
      stars: { from: NORTH_TRAIL[0].clone(), to: NORTH_TRAIL[1].clone() },
    };
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, DSCHUNGEL);

    this.floor.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.pool.init(ctx);
    this.stream.init(ctx);
    this.brook.init(ctx);
    this.bridge.init(ctx);
    this.waterfall.init(ctx);
    this.shafts.init(ctx);
    this.spores.init(ctx);
    this.fireflies.init(ctx);
    this.backdrop.init(ctx);
    this.cave.init(ctx);

    this.props = this.buildProps(ctx);
    this.props.forEach((mesh) => ctx.scene.add(mesh));

    this.air = findAir(ctx, this.sun.light);
    this.appliedHaze = -1;
    this.breathe(ctx.camera.position);
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.breathe(ctx.camera.position);
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.pool.update();
    this.stream.update();
    this.brook.update();
    this.waterfall.update(dt, ctx);
    this.shafts.update(dt, ctx);
    this.spores.update();
    this.fireflies.update();
  }

  /**
   * The seed lever: scatters the undergrowth, the spores, the fireflies and the far hills again
   * from their seeds shifted by `offset`. Everything that places a collider — the groves, the
   * boulders, the cliff — the canopy and the lianas hung from the kapok trees stay where they are.
   * Geometry and materials are kept, so a pull compiles no shader; the plants are even the same
   * instanced mesh, restood in place.
   */
  reseedDecoration(offset: number): void {
    if (!this.plants) {
      return;
    }
    standPlants(this.plants, PLANT_SEED + offset);
    this.spores.reseed(offset);
    this.fireflies.reseed(offset);
    this.backdrop.reseed(offset);
  }

  dispose(): void {
    this.props.forEach(disposeObject3D);
    this.props = [];
    this.cave.dispose();
    this.plants = null;
    this.air = null;
    this.backdrop.dispose();
    this.fireflies.dispose();
    this.spores.dispose();
    this.shafts.dispose();
    this.waterfall.dispose();
    this.bridge.dispose();
    this.brook.dispose();
    this.stream.dispose();
    this.pool.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.floor.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }

  /** Writes the slop, thinned by the bank the camera is over, into the fog, the sky and the light. */
  private breathe(camera: Vector3): void {
    // 0 over the north end of the deck and beyond, 1 over its south end and beyond.
    const south = smoothstep(
      -BRIDGE.halfLength,
      BRIDGE.halfLength,
      camera.z - streamCentreZ(camera.x),
    );
    this.hazeNow = this.slopAmount * (NORTH_BANK_HAZE + (1 - NORTH_BANK_HAZE) * south);
    if (!this.air || Math.abs(this.hazeNow - this.appliedHaze) < 1e-4) {
      return;
    }
    const t = this.hazeNow;
    const { fog, far, background, sun, hemisphere, sky } = this.air;
    fog.color.copy(CLEAR.fog).lerp(SLOPPED.fog, t);
    // The far hills ignore fog and mix towards their own airlight instead: the same colour.
    this.backdrop.airlight.value.copy(fog.color);
    fog.near = DSCHUNGEL.fog.near + (SLOP_AIR.fog.near - DSCHUNGEL.fog.near) * t;
    fog.far = far + (Math.min(SLOP_AIR.fog.far, far) - far) * t;
    background?.copy(fog.color);
    this.shared.heightFog.value.x =
      DSCHUNGEL.fog.heightDensity + (SLOP_AIR.fog.heightDensity - DSCHUNGEL.fog.heightDensity) * t;
    sun.color.copy(CLEAR.sun).lerp(SLOPPED.sun, t);
    this.shared.sunColor.value.copy(sun.color);
    hemisphere?.color.copy(CLEAR.hemisphereSky).lerp(SLOPPED.hemisphereSky, t);
    hemisphere?.groundColor.copy(CLEAR.hemisphereGround).lerp(SLOPPED.hemisphereGround, t);
    if (sky) {
      (sky.uniforms['zenith'].value as Color).copy(CLEAR.zenith).lerp(SLOPPED.zenith, t);
      (sky.uniforms['horizon'].value as Color).copy(CLEAR.horizon).lerp(SLOPPED.horizon, t);
      (sky.uniforms['below'].value as Color).copy(CLEAR.below).lerp(SLOPPED.below, t);
    }
    this.appliedHaze = t;
  }

  private buildProps(ctx: WorldContext): InstancedMesh[] {
    const shadows = ctx.quality.shadows;
    const leafy = (height: number, sway = 0.03) =>
      withWind(
        withAtmosphere(
          new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
          this.shared,
        ),
        this.shared,
        { amplitude: height * sway, height },
      );
    // Stone and hanging vines do not sway: the wind weight rises with height above the origin, and a
    // liana hangs below its origin.
    const still = withAtmosphere(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
      this.shared,
    );
    const tall = { castShadow: shadows, receiveShadow: shadows, tint: foliageTint, sink: 0.15 };

    const vines: Placement[] = this.groves.kapok.flatMap((tree, index) =>
      [0.9, 2.6].map((turn, k) => {
        const reach = 2.2 + k * 1.3;
        const angle = tree.rotation + turn;
        return {
          x: tree.x + Math.sin(angle) * reach,
          y: tree.y + tree.scale * 11.5,
          z: tree.z + Math.cos(angle) * reach,
          scale: 1,
          rotation: angle,
          tint: ((index * 2 + k) % 7) / 7,
        };
      }),
    );
    const cliff = buildInstanced(
      cliffWall(71, CLIFF.width, CLIFF.height, CLIFF.notch, {
        x: CAVE.x - CLIFF.x,
        width: HIDDEN_PLACE_SHELL.width,
        height: this.cave.position.y + HIDDEN_PLACE_SHELL.height - this.cliffBase,
        back: CAVE.z + HIDDEN_PLACE_SHELL.back - CLIFF.z,
      }),
      still,
      [{ x: CLIFF.x, y: this.cliffBase, z: CLIFF.z, scale: 1, rotation: 0, tint: 0 }],
      { name: 'cliff', castShadow: shadows, receiveShadow: shadows },
    );

    const { plants, canopy } = this.buildFoliage(ctx.quality);
    this.plants = plants;

    return [
      cliff,
      ...variants(kapokTree, [1, 2, 3], this.groves.kapok, leafy(16, 0.015), {
        name: 'kapok',
        ...tall,
      }),
      ...variants(palmTree, [4, 5], this.groves.palms, leafy(7.2), { name: 'palm', ...tall }),
      ...variants(treeFern, [6, 7], this.groves.ferns, leafy(3.5), { name: 'tree-fern', ...tall }),
      ...variants(mossyBoulder, [8, 9], this.groves.boulders, still, {
        name: 'boulder',
        castShadow: shadows,
        receiveShadow: shadows,
        tint: stoneTint,
      }),
      plants,
      canopy,
      ...variants(liana, [14, 15, 16], vines, still, { name: 'liana', tint: foliageTint }),
    ];
  }

  /**
   * The leaf clusters: plants on the floor that sway and give way to the visitor, and clusters hung
   * upside down under the kapok crowns. One geometry and two draw calls, the counts set by the tier.
   */
  private buildFoliage(quality: QualitySettings): {
    readonly plants: InstancedMesh;
    readonly canopy: InstancedMesh;
  } {
    const tier = FOLIAGE[TIER_BY_DETAIL[quality.shaderDetail]];
    const cluster = leafCluster();
    const leaves = (push: number) =>
      withFoliage(
        withAtmosphere(
          new MeshStandardMaterial({ color: 0xffffff, side: DoubleSide, roughness: 0.62 }),
          this.shared,
        ),
        this.shared,
        { push, translucency: tier.translucency },
      );

    const plants = foliage(cluster, leaves(1), tier.plants, 'plants');
    plants.castShadow = quality.shadows;
    plants.receiveShadow = quality.shadows;
    standPlants(plants, PLANT_SEED);

    const canopy = foliage(cluster, leaves(0), tier.canopy, 'canopy');
    canopy.castShadow = quality.shadows;
    hangCanopy(canopy, CANOPY_SEED);

    return { plants, canopy };
  }
}

function toySpot(slot: Slot): ToySpot {
  return { position: slot.position.clone(), rotationY: slot.yaw };
}

/** Metres either side of their spot the release cairns spread. */
const CAIRN_SPREAD = 2.5;

/**
 * The line the release cairns are laid beside, so they stand across `slot`, square to the way it
 * faces: `ReleaseMarkers` lays them `MARKER_OFFSET` behind the line, so the line runs that far in
 * front of the spot, towards the trail, and their version labels face it.
 */
function cairnLine(slot: Slot): ToyLine {
  const across = new Vector3(Math.cos(slot.yaw), 0, -Math.sin(slot.yaw));
  const centre = slot.position
    .clone()
    .addScaledVector(new Vector3(Math.sin(slot.yaw), 0, Math.cos(slot.yaw)), MARKER_OFFSET);
  return {
    from: centre.clone().addScaledVector(across, -CAIRN_SPREAD),
    to: centre.clone().addScaledVector(across, CAIRN_SPREAD),
  };
}

/** The fog, the lights and the sky dome the kit objects built, for the slop to tint. */
function findAir(ctx: WorldContext, sun: DirectionalLight): Air | null {
  const { fog, background } = ctx.scene;
  if (!(fog instanceof Fog)) {
    return null;
  }
  const hemisphere = ctx.scene.getObjectByName('sky-light');
  const dome = ctx.scene.getObjectByName('sky-dome');
  return {
    fog,
    far: fog.far,
    background: background instanceof Color ? background : null,
    sun,
    hemisphere: hemisphere instanceof HemisphereLight ? hemisphere : null,
    sky: dome instanceof Mesh && dome.material instanceof ShaderMaterial ? dome.material : null,
  };
}

/** The walked lines, each with its length, for spreading things along all of them evenly. */
const WALKED = PATHS.map((path) => ({
  path,
  length: path.slice(1).reduce((sum, point, i) => sum + point.distanceTo(path[i]), 0),
}));
const WALKED_LENGTH = WALKED.reduce((sum, { length }) => sum + length, 0);

/**
 * A point up to `reach` either side of a walked line, spread evenly along all of them: every call
 * draws exactly two numbers.
 */
function besideTrails(random: Random, reach: number): { x: number; z: number } {
  let along = random() * WALKED_LENGTH;
  const offset = (random() * 2 - 1) * reach;
  for (const { path, length } of WALKED) {
    if (along <= length || path === WALKED[WALKED.length - 1].path) {
      const point = pointAlong(path, along);
      const behind = pointAlong(path, along - 0.5);
      const ahead = pointAlong(path, along + 0.5);
      const dx = ahead.x - behind.x;
      const dz = ahead.z - behind.z;
      const length = Math.hypot(dx, dz) || 1;
      return { x: point.x - (dz / length) * offset, z: point.z + (dx / length) * offset };
    }
    along -= length;
  }
  return { x: 0, z: 0 };
}

const PLANT_SEED = 61;
const CANOPY_SEED = 63;
const cursor = new Object3D();
const leafColour = new Color();

function foliage(
  geometry: BufferGeometry,
  material: Material,
  count: number,
  name: string,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = name;
  return mesh;
}

/**
 * Stands every plant of `mesh` from `seed`: kept off the stage floor, small where visitors walk
 * and up to three times the size out in the groves, leaning a little, in one of five greens. Every
 * candidate draws the same numbers whether it is kept or not, like `scatter`.
 */
function standPlants(mesh: InstancedMesh, seed: number): void {
  const random = seededRandom(seed);
  // The capacity, not `count`: an earlier stand may have drawn fewer.
  const capacity = mesh.instanceMatrix.count;
  const attempts = capacity * 30;
  let placed = 0;

  for (let attempt = 0; attempt < attempts && placed < capacity; attempt++) {
    const { x, z } = besideTrails(random, PLANT_REACH);
    const growth = random() ** 1.6;
    const stretch = between(random, 0.8, 1.3);
    const tiltX = (random() - 0.5) * 0.25;
    const turn = random() * Math.PI * 2;
    const tiltZ = (random() - 0.5) * 0.25;
    const hue = (random() - 0.5) * 0.03;
    const lightness = (random() - 0.5) * 0.08;
    if (isExcluded(x, z, STAGE_FLOOR)) {
      continue;
    }

    const size = 0.55 + growth * (isExcluded(x, z, STAGE) ? 0.55 : 2);
    cursor.position.set(x, jungleHeightAt(x, z) - 0.05, z);
    cursor.rotation.set(tiltX, turn, tiltZ);
    cursor.scale.set(size, size * stretch, size);
    cursor.updateMatrix();
    mesh.setMatrixAt(placed, cursor.matrix);
    leafColour.setHex(LEAF_GREENS[placed % LEAF_GREENS.length]).offsetHSL(hue, 0, lightness);
    mesh.setColorAt(placed, leafColour);
    placed++;
  }

  // Too crowded a stage to place them all: draw only those that found a spot.
  mesh.count = placed;
  finish(mesh);
}

/**
 * Hangs every canopy cluster of `mesh` upside down 7 to 11 m over the ground, lifted where needed
 * so its lowest leaf stays `CANOPY_CLEARANCE` above the visitor and the camera behind them.
 */
function hangCanopy(mesh: InstancedMesh, seed: number): void {
  const random = seededRandom(seed);
  // The capacity, not `count`: an earlier stand may have drawn fewer.
  const capacity = mesh.instanceMatrix.count;
  const attempts = capacity * 30;
  let placed = 0;

  for (let attempt = 0; attempt < attempts && placed < capacity; attempt++) {
    const { x, z } = besideTrails(random, CANOPY_REACH);
    const size = between(random, 2.5, 5);
    const lift = between(random, 7, 11);
    const tiltX = (random() - 0.5) * 0.6;
    const turn = random() * Math.PI * 2;
    const tiltZ = (random() - 0.5) * 0.6;
    if (isExcluded(x, z, OPEN_SKY)) {
      continue;
    }

    const above = Math.max(lift, CANOPY_CLEARANCE + CANOPY_DROOP * size);
    cursor.position.set(x, jungleHeightAt(x, z) + above, z);
    cursor.rotation.set(Math.PI + tiltX, turn, tiltZ);
    cursor.scale.setScalar(size);
    cursor.updateMatrix();
    mesh.setMatrixAt(placed, cursor.matrix);
    leafColour.setHex(LEAF_GREENS[(placed + 2) % LEAF_GREENS.length]).offsetHSL(0, 0, -0.05);
    mesh.setColorAt(placed, leafColour);
    placed++;
  }

  mesh.count = placed;
  finish(mesh);
}

function finish(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
}

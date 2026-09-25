import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
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
import { BOOM_LENGTH } from '@engine/player/third-person-rig';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Backdrop } from './backdrop';
import type { EnvironmentOptions } from './create-environment';
import { MARKER_OFFSET } from './data/release-markers';
import { Anchor, Environment, ToyLayout, ToyLine, ToySpot } from './environment';
import { kapokTree, leafCluster, liana, mossyBoulder, palmTree, treeFern } from './flora';
import { ProceduralGround } from './ground';
import { JungleBridge } from './jungle-bridge';
import { JungleCave } from './jungle-cave';
import {
  ARCH,
  BAMBOO,
  BOWL,
  CAIRN,
  CARD_SLOTS,
  CAVE,
  CLIFF,
  DECK,
  EXHIBIT,
  FIREFLY_GLADE,
  LANTERN_POST,
  LIANA,
  PATHS,
  POOL,
  PORTAL,
  PORTAL_NICHE,
  Placed,
  Pt,
  RETURN_PORTAL,
  RILL,
  RILL_REACH,
  STATION_STANDS,
  STELE,
  STEPS,
  WALL,
  WATERFALL,
  beyondBowl,
  distanceToPaths,
  distanceToRill,
  inBowl,
  jungleHeightAt,
} from './jungle-layout';
import { JungleSteps } from './jungle-steps';
import { bakeGeometry } from './model-geometry';
import { LightShafts } from './light-shafts';
import { DSCHUNGEL, applyMood, clearMood } from './mood';
import { Motes } from './motes';
import { Random, between, seededRandom, valueNoise } from './random';
import {
  Exclusion,
  Placement,
  cylinderColliders,
  foliageTint,
  isExcluded,
  scatter,
  stoneTint,
  variants,
} from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { withClearingRing } from './shaders/clearing-ring';
import { withDapple } from './shaders/dapple';
import { withFoliage } from './shaders/foliage';
import { GroundHaze } from './shaders/ground-haze';
import { withGroundDetail } from './shaders/ground-detail';
import { SharedUniforms } from './shaders/shared-uniforms';
import { withWind } from './shaders/wind';
import { Sky } from './sky';
import { Sun } from './sun';
import { Water } from './water';
import { Waterfall } from './waterfall';

/** Edge length of the floor: the bowl and the rim all round it, whose crest hides the floor's edge. */
const SIZE = 90;
/** Grid cells along an edge: half a metre apart, fine enough for the rill's banks and the ramps. */
const SEGMENTS = 180;

export { CAVE, POOL, jungleHeightAt };

/** The pool's water line, under the falls. */
export const POOL_LEVEL = POOL.level;
/** The rill's water line: the section's zero. */
export const RILL_LEVEL = 0;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A polyline as segment exclusions `halfWidth` either side of it. */
function along(path: readonly Pt[], halfWidth: number): Exclusion[] {
  return path.slice(1).map((point, i) => ({
    kind: 'segment' as const,
    ax: path[i].x,
    az: path[i].z,
    bx: point.x,
    bz: point.z,
    halfWidth,
  }));
}

/** A segment `reach` either side of a prop, square to the way it faces. */
function sideways(place: Placed, reach: number, halfWidth: number): Exclusion {
  const across = [Math.cos(place.yaw), -Math.sin(place.yaw)];
  return {
    kind: 'segment',
    ax: place.x - across[0] * reach,
    az: place.z - across[1] * reach,
    bx: place.x + across[0] * reach,
    bz: place.z + across[1] * reach,
    halfWidth,
  };
}

/** The rill's centre line, sampled every metre from one side of the rim to the other. */
const RILL_LINE: readonly Pt[] = Array.from(
  { length: RILL_REACH.east - RILL_REACH.west + 1 },
  (_, i) => {
    const x = RILL_REACH.west + i;
    return { x, z: RILL.centreZ(x) };
  },
);

/** Everything the flow furnishes that stands on the ground, with the room it needs. */
const FURNITURE: readonly Exclusion[] = [
  { kind: 'circle', x: LANTERN_POST.x, z: LANTERN_POST.z, radius: 1.5 },
  ...CARD_SLOTS.map(({ x, z }) => ({ kind: 'circle' as const, x, z, radius: 2.2 })),
  { kind: 'circle', x: STELE.x, z: STELE.z, radius: 1.5 },
  ...BAMBOO.map(({ x, z }) => ({ kind: 'circle' as const, x, z, radius: 0.8 })),
  { kind: 'circle', x: CAIRN.x, z: CAIRN.z, radius: 2.5 },
  { kind: 'circle', x: LIANA.x, z: LIANA.z, radius: 2 },
  // The easel stands 3.4 m wide, the wall 5.6 m.
  sideways(EXHIBIT, 2.5, 1.5),
  sideways(WALL, 3.5, 1.5),
];

/**
 * Where exhibits may stand, each turned to the portal: the first is the easel on the glade, the
 * rest spare spots in the open, for a world with more than one exhibit.
 */
const LANDMARK_SPOTS: readonly Placed[] = [
  EXHIBIT,
  ...(
    [
      [-11, -6],
      [11, 5],
      [-13, 4],
    ] as const
  ).map(([x, z]) => ({ x, z, yaw: Math.atan2(PORTAL.x - x, PORTAL.z - z) })),
];

/**
 * Behind each station's stand, where the camera hangs on its boom (the player's yaw: back is
 * (sin yaw, cos yaw)), with room either side for a crown: nothing tall stands in its face.
 */
const STATION_CAMERAS: readonly Exclusion[] = Object.values(STATION_STANDS).map((stand) => ({
  kind: 'segment',
  ax: stand.x,
  az: stand.z,
  bx: stand.x + Math.sin(stand.yaw) * (BOOM_LENGTH + 0.4),
  bz: stand.z + Math.cos(stand.yaw) * (BOOM_LENGTH + 0.4),
  halfWidth: 2.2,
}));

/**
 * Where nothing tall stands: the arrival, a corridor along every walked line, the rill with its
 * banks, room around everything the flow stands, the view from the portal through the arch to the
 * exhibit and from the deck to the falls, the stands in front of the exhibit and the wall, and the
 * cameras behind the stations' stands.
 */
export const STAGE: readonly Exclusion[] = [
  { kind: 'circle', x: PORTAL.x, z: PORTAL.z, radius: 4 },
  ...PATHS.flatMap((path) => along(path, 3)),
  ...along(RILL_LINE, RILL.halfWidth + 1.5),
  ...FURNITURE.map((zone) =>
    zone.kind === 'circle' ? { ...zone, radius: zone.radius + 1.5 } : zone,
  ),
  { kind: 'segment', ax: PORTAL.x, az: PORTAL.z, bx: EXHIBIT.x, bz: EXHIBIT.z, halfWidth: 2.5 },
  { kind: 'segment', ax: ARCH.x, az: ARCH.z, bx: POOL.x, bz: POOL.z, halfWidth: 3 },
  sideways(EXHIBIT, 4, 3.5),
  sideways(WALL, 4.5, 3),
  ...LANDMARK_SPOTS.slice(1).map(({ x, z }) => ({ kind: 'circle' as const, x, z, radius: 3.5 })),
  ...STATION_CAMERAS,
];

/** Metres either side of the axis, from the portal to the pool, that no crown reaches into. */
const VIEW_CLEAR = 4;

/**
 * The view down the axis from the portal over the arch to the falls, kept clear of anything whose
 * crown reaches `reach` metres from its root: the corridor round the line from the portal to the
 * pool, `VIEW_CLEAR` wider than the crown either side.
 */
function viewCorridor(reach: number): Exclusion {
  return {
    kind: 'segment',
    ax: PORTAL.x,
    az: PORTAL.z,
    bx: POOL.x,
    bz: POOL.z,
    halfWidth: VIEW_CLEAR + reach,
  };
}

/**
 * Each grove's scale range, and how far its widest crown reaches from the trunk at scale 1 (the
 * flora's own geometry: the kapok's umbrella, the palm's fronds with its lean, the fern's rosette).
 */
const GROVE = {
  kapok: { scale: [0.85, 1.15], crown: 6.2 },
  palms: { scale: [0.85, 1.2], crown: 4 },
  ferns: { scale: [0.8, 1.3], crown: 2.15 },
} as const;

/**
 * The ledge and the marsh under the overview, which looks down the axis from high over the south
 * rim: a kapok's 15 m umbrella there would stand in the shot's foreground and hide the marsh.
 */
const OVERVIEW_FOREGROUND: Exclusion = {
  kind: 'circle',
  x: PORTAL.x,
  z: PORTAL.z + 9.4,
  radius: 20,
};

/** A canopy cluster's spread from its root and its length down, at scale 1 (`leafCluster`). */
const CLUSTER = { spread: 0.75, length: 1.3 } as const;

/** The cliff's foot and the pool's edge. */
const ROCK: readonly Exclusion[] = [
  {
    kind: 'segment',
    ax: -CLIFF.width / 2 - 2,
    az: CLIFF.z,
    bx: CLIFF.width / 2 + 2,
    bz: CLIFF.z,
    halfWidth: 2,
  },
  { kind: 'circle', x: POOL.x, z: POOL.z, radius: POOL.rx + 1.5 },
];

/**
 * Where even the undergrowth stays out: the arrival point, the walked lines, the rill and the pool,
 * the footprints of everything the flow stands, and the cliff's foot.
 */
export const STAGE_FLOOR: readonly Exclusion[] = [
  { kind: 'circle', x: PORTAL.x, z: PORTAL.z, radius: 2 },
  ...PATHS.flatMap((path) => along(path, 1.6)),
  ...along(RILL_LINE, RILL.halfWidth + 0.3),
  ...FURNITURE,
  { kind: 'circle', x: POOL.x, z: POOL.z, radius: POOL.rx + 0.3 },
  ROCK[0],
];

/** The rill's water: the prototype's #3a8a8f over the shallows, its #8cc3c8 edge as foam. */
const RILL_COLOURS = { shallow: 0x3a8a8f, deep: 0x163c3e, foam: 0x8cc3c8 } as const;
/** The rill runs half under the canopy: it mirrors leaves more than the pale sky. */
const RILL_REFLECTION = 0.35;

/** Metres a band either side of the rill's line reaches: the water and its steep banks. */
const RILL_BAND = RILL.halfWidth + 0.3;

/**
 * The water no one walks into: the rill as a row of boxes 2 m long, each as deep as the band
 * either side of the centre line over its length, with the deck's width left open between them,
 * running into the bowl's edge at both ends; and the pool as four discs just inside its ellipse,
 * leaving the way behind the falls open between the pool and the cliff.
 */
function waterColliders(): Collider[] {
  const colliders: Collider[] = [];
  const span = (from: number, to: number) => {
    for (let x = from; x < to - 1e-9; x += 2) {
      const end = Math.min(x + 2, to);
      let low = Infinity;
      let high = -Infinity;
      for (let sample = x; sample < end + 0.25; sample += 0.25) {
        const centre = RILL.centreZ(Math.min(sample, end));
        low = Math.min(low, centre);
        high = Math.max(high, centre);
      }
      colliders.push({
        kind: 'aabb',
        minX: x,
        maxX: end,
        minZ: low - RILL_BAND,
        maxZ: high + RILL_BAND,
      });
    }
  };
  span(RILL_REACH.west, ARCH.x - DECK.halfWidth);
  span(ARCH.x + DECK.halfWidth, RILL_REACH.east);

  for (const x of [-1.8, -0.6, 0.6, 1.8]) {
    colliders.push({ kind: 'cylinder', x: POOL.x + x, z: POOL.z, radius: 1.1 });
  }
  return colliders;
}

const WATER_COLLIDERS: readonly Collider[] = waterColliders();

/** The edge ring's discs: their radius, and how far their inner edge reaches inside the bowl. */
const EDGE = { radius: 1.5, inset: 0.3 } as const;
/** Metres thick the portal niche's walls are. */
const NICHE_WALL = 1;

/**
 * The bowl's edge, too thick to push through: a ring of discs overlapping round the ellipse, their
 * inner edges just inside it, and none wholly behind the cliff face, whose rock closes the north
 * and whose cave reaches past the ellipse. Across the mouth of the portal's niche the ring gives
 * way to the niche's own walls: one either side and one across its back.
 */
function edgeColliders(): Collider[] {
  const rx = BOWL.rx + EDGE.radius - EDGE.inset;
  const rz = BOWL.rz + EDGE.radius - EDGE.inset;
  // Ramanujan's perimeter, a disc every 0.9 radius along it.
  const perimeter = Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
  const count = Math.ceil(perimeter / (EDGE.radius * 0.9));
  const colliders: Collider[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = rx * Math.cos(angle);
    const z = rz * Math.sin(angle);
    if (Math.abs(x) + EDGE.radius < CLIFF.width / 2 && z + EDGE.radius < CLIFF.z) {
      continue;
    }
    if (z > 0 && Math.abs(x) < PORTAL_NICHE.halfWidth + NICHE_WALL / 2) {
      continue;
    }
    colliders.push({ kind: 'cylinder', x, z, radius: EDGE.radius });
  }
  const { halfWidth, back } = PORTAL_NICHE;
  const mouth = BOWL.rz - EDGE.inset;
  colliders.push(
    { kind: 'aabb', minX: -halfWidth - NICHE_WALL, maxX: -halfWidth, minZ: mouth, maxZ: back },
    { kind: 'aabb', minX: halfWidth, maxX: halfWidth + NICHE_WALL, minZ: mouth, maxZ: back },
    {
      kind: 'aabb',
      minX: -halfWidth - NICHE_WALL,
      maxX: halfWidth + NICHE_WALL,
      minZ: back,
      maxZ: back + NICHE_WALL,
    },
  );
  return colliders;
}

const EDGE_COLLIDERS: readonly Collider[] = edgeColliders();

/** The bowl's floor area in square metres. */
const BOWL_AREA = Math.PI * BOWL.rx * BOWL.rz;

/**
 * Leaf clusters per square metre of the bowl, per tier: the density the jungle's undergrowth had
 * along its old trails (1400 plants over some 4500 m² on the high tier), so the smaller world is as
 * thick with leaves and cheaper.
 */
const FOLIAGE_DENSITY: Readonly<
  Record<QualityTier, { readonly plants: number; readonly canopy: number }>
> = {
  low: { plants: 0.07, canopy: 0.008 },
  medium: { plants: 0.2, canopy: 0.022 },
  high: { plants: 0.31, canopy: 0.04 },
};

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
  low: {
    plants: Math.round(FOLIAGE_DENSITY.low.plants * BOWL_AREA),
    canopy: Math.round(FOLIAGE_DENSITY.low.canopy * BOWL_AREA),
    translucency: 0,
  },
  medium: {
    plants: Math.round(FOLIAGE_DENSITY.medium.plants * BOWL_AREA),
    canopy: Math.round(FOLIAGE_DENSITY.medium.canopy * BOWL_AREA),
    translucency: 0.7,
  },
  high: {
    plants: Math.round(FOLIAGE_DENSITY.high.plants * BOWL_AREA),
    canopy: Math.round(FOLIAGE_DENSITY.high.canopy * BOWL_AREA),
    translucency: 1.1,
  },
};
/** `QualitySettings` names no tier; its shader detail is 0, 1 and 2 on the three of them. */
const TIER_BY_DETAIL: readonly QualityTier[] = ['low', 'medium', 'high'];
const LEAF_GREENS: readonly number[] = [0x3f7a34, 0x4f8a3a, 0x2f6a36, 0x5d8f3c, 0x356f45];
/**
 * Where no canopy hangs: over the rill either side of the deck, so the water and the arch stand in
 * open light, across the view from the deck to the falls, over the pool, and against the cliff.
 */
const OPEN_SKY: readonly Exclusion[] = [
  { kind: 'segment', ax: ARCH.x - 8, az: ARCH.z, bx: ARCH.x + 8, bz: ARCH.z, halfWidth: 4 },
  { kind: 'segment', ax: ARCH.x, az: ARCH.z, bx: POOL.x, bz: POOL.z, halfWidth: 4 },
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
const STONE = new Color(0x5f5c50);
const scratch = new Color();

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The forest floor at one corner: moss, leaf litter, the trodden paths, silt along the rill and
 * round the pool, and bare stone up the rim and the cliff.
 */
export function jungleGround(x: number, z: number, height: number): Color {
  scratch
    .copy(HOLLOW)
    .lerp(MOSS, clamp01((height + 0.5) / 1.5))
    .lerp(MOSS_LIT, clamp01(valueNoise(x * 0.08, z * 0.08, 5) - 0.45) * 1.2);
  const litter = valueNoise(x * 0.3, z * 0.3, 6);
  if (litter > 0.6) {
    scratch.lerp(LITTER, (litter - 0.6) * 1.8);
  }
  const toPool = Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz);
  if (toPool < 1.5) {
    scratch.lerp(SILT, clamp01((1.5 - toPool) / 0.4));
  }
  const shore = distanceToRill(x, z) - RILL.halfWidth;
  if (shore < 1) {
    scratch.lerp(SILT, clamp01((1 - shore) / 0.8));
  }
  const trail = distanceToPaths(x, z);
  if (trail < 1.4) {
    scratch.lerp(TRAIL, (1 - trail / 1.4) * 0.8);
  }
  const rock = Math.max(smoothstep(4, 8, height), smoothstep(-1, 1, beyondBowl(x, z)) * 0.6);
  if (rock > 0) {
    scratch.lerp(STONE, rock * 0.8);
  }
  return scratch;
}

/**
 * The violet air the slop brings (Turn 2's south bank): DSCHUNGEL's fog, light and sky pulled
 * towards the slop colour #9a3f8d, the fog closer and thicker. The slop itself lies on the ground
 * as the ground haze; the air only leans `SLOP_TINT` of the way towards this.
 */
export const SLOP_AIR = {
  fog: { color: 0x86608e, near: 3, far: 55, heightDensity: 0.075 },
  hemisphere: { sky: 0xb898c6, ground: 0x3b2a3c },
  sun: 0xf2d4ec,
  sky: { zenith: 0x5c5078, horizon: 0x9a7c9f, below: 0x4a3a52 },
} as const;

/**
 * How far the air leans towards `SLOP_AIR` at full slop: a light tint, so the jungle keeps its own
 * mood and the violet reads where the ground haze lies, not over the whole view.
 */
export const SLOP_TINT = 0.25;

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

/** The surface the ground haze lies on: the ground, or the water's over the rill and the pool. */
function hazeGroundAt(x: number, z: number): number {
  const ground = jungleHeightAt(x, z);
  const inPool = ((x - POOL.x) / POOL.rx) ** 2 + ((z - POOL.z) / POOL.rz) ** 2 < 1;
  return Math.max(ground, inPool ? POOL.level : RILL_LEVEL);
}

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
 * Laid out as Deslopify's Lichtung (`jungle-layout.ts`): a bowl on one south–north axis, from the
 * arrival ledge over the marsh boardwalk and up the commit steps to the arch on its deck over the
 * rill, then round the north loop past the exhibit and the feed wall to the cave behind the falls.
 * The rim rises all round, so the edge of the world is never in sight.
 */
export class JungleEnvironment implements Environment {
  readonly id = 'jungle' as const;
  readonly name = 'Dschungel';
  /** The portal on the ledge, in front of the return portal; arrivals look north along the axis. */
  readonly spawn = new Vector3(PORTAL.x, jungleHeightAt(PORTAL.x, PORTAL.z), PORTAL.z);
  /** The portal's heading is already the player's own: 0 looks north. */
  readonly spawnYaw = PORTAL.yaw;
  /** The return portal, in its niche in the rim behind the arrival, facing north over it. */
  readonly returnPortal: Anchor = {
    position: [RETURN_PORTAL.x, 0, RETURN_PORTAL.z],
    rotationY: RETURN_PORTAL.yaw,
  };
  /** The light and air of this place; the scene reads it to match whatever stands in it. */
  readonly mood = DSCHUNGEL;
  /**
   * The clearing Deslopify spreads, as uniforms any material can take by identity: the ring's
   * centre in world space (`uClearOrigin`) and its radius in metres (`uClearRadius`), and how
   * brightly its edge glows on the floor (`uClearGlow`, 0 while no ring runs). The flow writes
   * them; the ring starts at the arch with nothing cleared.
   */
  readonly clearing = {
    origin: { value: new Vector3(ARCH.x, DECK.height, ARCH.z) },
    radius: { value: 0 },
    glow: { value: 0 },
  };
  /**
   * The slop lying in the bowl: a violet haze on the ground that the ring and the lit lantern
   * clear. `setSlop` sets how much of it there is; the scene writes the lantern's light.
   */
  readonly groundHaze = new GroundHaze({ heightAt: hazeGroundAt, clearing: this.clearing });
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(DSCHUNGEL, { groundHaze: this.groundHaze });
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[] = [];
  /** The deck over the rill, and the arch on it. */
  readonly bridge: JungleBridge;
  /** The boardwalk and the commit steps up to the deck; the flow lights the steps. */
  readonly steps: JungleSteps;
  /** The cliff across the north end and the cave behind the falls. */
  readonly cave: JungleCave;

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: SEGMENTS,
    heightAt: jungleHeightAt,
    colorAt: jungleGround,
    decorate: (material, quality) =>
      void withClearingRing(
        withGroundDetail(
          withDapple(withAtmosphere(material, this.shared), this.shared, 0.75),
          quality.shaderDetail,
        ),
        this.clearing,
      ),
  });
  private readonly sky = new Sky({ mood: DSCHUNGEL, shared: this.shared });
  private readonly sun = new Sun({
    mood: DSCHUNGEL,
    shared: this.shared,
    normalBias: JUNGLE_SHADOW_NORMAL_BIAS,
  });
  /** The pool, a ribbon over its ellipse: the depth fade hides what the bank covers. */
  private readonly pool = new Water({
    shared: this.shared,
    mood: DSCHUNGEL,
    path: [
      [POOL.x - POOL.rx + POOL.rz, POOL.z],
      [POOL.x + POOL.rx - POOL.rz, POOL.z],
    ],
    halfWidth: POOL.rz + 0.2,
    level: POOL.level,
    ground: this.floor,
    colours: { shallow: 0x6fa89a, deep: 0x1f4a45, foam: 0xf0fff8 },
    bankFog: true,
  });
  /** The rill, drawn a little past its banks: the depth fade hides what the bank covers. */
  private readonly rill = new Water({
    shared: this.shared,
    mood: DSCHUNGEL,
    path: RILL_LINE.map(({ x, z }) => [x, z] as const),
    halfWidth: RILL.halfWidth + 0.3,
    level: RILL_LEVEL,
    ground: this.floor,
    colours: RILL_COLOURS,
    reflection: RILL_REFLECTION,
    bankFog: true,
    flow: [-0.45, 0],
  });
  private readonly waterfall = new Waterfall({
    shared: this.shared,
    mood: DSCHUNGEL,
    // Just proud of the rock's flush face, so the sheet never grazes it.
    lip: [(WATERFALL.x0 + WATERFALL.x1) / 2, WATERFALL.top, WATERFALL.z + 0.15],
    width: WATERFALL.x1 - WATERFALL.x0,
    drop: WATERFALL.top - WATERFALL.bottom,
    rotationY: 0,
    colours: { water: 0xcfeee6, foam: 0xffffff },
  });
  private readonly shafts = new LightShafts({
    shared: this.shared,
    colour: 0xf2ffd0,
    intensity: 2,
    shafts: [
      // One on the deck, so the arch stands in light, one by the lantern, and the rest beside the
      // boardwalk, over the steps, on the glade by the exhibit and the wall, and by the pool.
      { x: ARCH.x, z: ARCH.z, radius: 2.2, height: 30 },
      { x: LANTERN_POST.x + 1.5, z: LANTERN_POST.z - 1.5, radius: 1.4, height: 30 },
      { x: STATION_STANDS.pfad.x - 2, z: STATION_STANDS.pfad.z - 0.6, radius: 1.6, height: 30 },
      {
        x: (STEPS.from.x + STEPS.to.x) / 2 + 1.5,
        z: (STEPS.from.z + STEPS.to.z) / 2 + 1,
        radius: 1.3,
        height: 30,
      },
      { x: EXHIBIT.x - 3, z: EXHIBIT.z + 1, radius: 1.6, height: 30 },
      { x: WALL.x - 2.4, z: WALL.z - 1.5, radius: 1.4, height: 30 },
      { x: POOL.x - POOL.rx - 1.5, z: POOL.z + 1.6, radius: 1.2, height: 30 },
    ],
  });
  private readonly spores = new Motes({
    shared: this.shared,
    seed: 401,
    count: 350,
    area: { x: 0, z: 0, radius: 22, minY: -1.2, maxY: 4 },
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
    area: { x: 0, z: 0, radius: 24, minY: 0.3, maxY: 2.2 },
    followCamera: false,
    heightAt: jungleHeightAt,
    colour: 0xd8ff7a,
    size: 0.07,
    glow: 4,
    directGlow: 1.3,
    drift: 1.5,
    flicker: 1,
  });
  /** The far hills, beyond the rim; public so a spec can watch the slop reach them. */
  readonly backdrop = new Backdrop(
    [
      {
        radius: 62,
        depth: 30,
        height: 26,
        roughness: 0.8,
        color: 0x2f5a3a,
        haze: 0.35,
        seed: 111,
      },
      { radius: 95, depth: 45, height: 38, roughness: 0.7, color: 0x3f6a55, haze: 0.6, seed: 112 },
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
  /** Set by `dispose`, so boulders arriving afterwards are only handed back. */
  private disposed = false;
  /** The collider-free undergrowth the seed lever scatters again; also listed in `props`. */
  private plants: InstancedMesh | null = null;
  private scene: WorldContext['scene'] | null = null;
  private air: Air | null = null;
  private slopAmount = 1;
  /** The haze last written into the air, so a still frame writes nothing. */
  private appliedHaze = -1;
  private hazeNow = 1;

  constructor(private readonly options: EnvironmentOptions) {
    const exclusions = [...STAGE, ...ROCK];
    // The tall ones stand back from the view down the axis far enough for their crowns to clear it.
    const clear = ({ scale, crown }: { scale: readonly number[]; crown: number }) => [
      ...exclusions,
      viewCorridor(crown * Math.max(...scale)),
    ];
    const area = { x: 0, z: 0, inner: 0, outer: BOWL.rx };
    // Scattered over the circle round the bowl, kept where a trunk of `reach` stands wholly inside it.
    const grove = (placements: readonly Placement[], reach: number) =>
      placements.filter(({ x, z }) => beyondBowl(x, z) < -(reach + EDGE.inset));
    this.groves = {
      kapok: grove(
        scatter(
          {
            seed: 51,
            count: 16,
            area,
            scale: GROVE.kapok.scale,
            minSpacing: 7,
            exclusions: [...clear(GROVE.kapok), OVERVIEW_FOREGROUND],
          },
          this.floor,
        ),
        1.2,
      ),
      palms: grove(
        scatter(
          {
            seed: 52,
            count: 30,
            area,
            clusters: { count: 8, radius: 4 },
            scale: GROVE.palms.scale,
            minSpacing: 2.5,
            exclusions: clear(GROVE.palms),
          },
          this.floor,
        ),
        0.5,
      ),
      ferns: grove(
        scatter(
          {
            seed: 53,
            count: 40,
            area,
            scale: GROVE.ferns.scale,
            minSpacing: 2,
            exclusions: clear(GROVE.ferns),
          },
          this.floor,
        ),
        0.5,
      ),
      boulders: grove(
        scatter(
          { seed: 54, count: 20, area, scale: [0.7, 1.5], minSpacing: 3, exclusions },
          this.floor,
        ),
        1.5,
      ),
    };

    this.bridge = new JungleBridge({ shared: this.shared });
    this.steps = new JungleSteps({ shared: this.shared });
    this.cave = new JungleCave({ shared: this.shared });

    this.colliders = [
      ...this.cave.colliders,
      ...WATER_COLLIDERS,
      ...this.bridge.colliders,
      ...this.steps.colliders,
      ...EDGE_COLLIDERS,
      ...cylinderColliders(this.groves.kapok, 0.9),
      ...cylinderColliders(this.groves.palms, 0.25),
      ...cylinderColliders(this.groves.ferns, 0.22),
      ...cylinderColliders(this.groves.boulders, 0.95),
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
   * The haze actually in the air this frame: the slop itself, over the whole bowl. The north half
   * starts in the slop too (spec §4); only the ring from the arch clears it.
   */
  get haze(): number {
    return this.hazeNow;
  }

  /**
   * How much slop there is, 0 … 1: the ground haze's amount, and a light tint of the air towards
   * the violet (`SLOP_TINT` of the way at 1): fog colour, distance and density, the sky's colours
   * and the sun and sky light's tints. The flow drives it, easing it however it likes; the jungle
   * applies whatever it is given at once. Clamped to 0 … 1.
   */
  setSlop(value: number): void {
    this.slopAmount = clamp01(value);
    this.bridge.setGlow(1 - this.slopAmount);
    this.setGroundHaze(this.slopAmount);
  }

  /** How much ground haze lies in the bowl, 0 … 1; `setSlop` sets it too. */
  setGroundHaze(amount: number): void {
    this.groundHaze.setAmount(amount);
  }

  /** Where the lantern's light clears the ground haze, each frame; a radius of 0 while it is dark. */
  setHazeLight(x: number, z: number, radius: number): void {
    this.groundHaze.setLight(x, z, radius);
  }

  /**
   * Exhibits stand where `LANDMARK_SPOTS` keeps room for them, the first the easel on the glade
   * facing south down the axis. A fixed layout: it has four spots and never honours `avoid`.
   */
  anchors(count: number): readonly Anchor[] {
    return LANDMARK_SPOTS.slice(0, count).map(({ x, z, yaw }) => ({
      position: [x, 0, z] as const,
      rotationY: yaw,
    }));
  }

  /**
   * The shared toys at the spots the layout keeps for them: the stele in the cave, the liana east
   * of the feed wall, one bamboo stalk per language at the deck's corners, the release cairn
   * beside the exhibit and the star lanterns over the glade. The commit steps take the ridge's
   * place, so the jungle lays out none.
   */
  toyLayout(): ToyLayout {
    const stalks = BAMBOO.map(({ x, z }) => new Vector3(x, 0, z));
    return {
      terminal: toySpot(STELE),
      lever: toySpot(LIANA),
      languages: { position: stalks[0].clone(), rotationY: 0, stalks },
      releases: cairnLine({ x: CAIRN.x, z: CAIRN.z, yaw: -Math.PI / 2 }),
      stars: {
        from: new Vector3(FIREFLY_GLADE.x - FIREFLY_GLADE.rx, 0, FIREFLY_GLADE.z),
        to: new Vector3(FIREFLY_GLADE.x + FIREFLY_GLADE.rx, 0, FIREFLY_GLADE.z),
      },
    };
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, DSCHUNGEL);
    // Before anything compiles, and before the water reads it: the march's step count.
    this.groundHaze.setDetail(ctx.quality.shaderDetail);

    this.floor.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.pool.init(ctx);
    this.rill.init(ctx);
    this.bridge.init(ctx);
    this.steps.init(ctx);
    this.cave.init(ctx);
    this.waterfall.init(ctx);
    this.shafts.init(ctx);
    this.spores.init(ctx);
    this.fireflies.init(ctx);
    this.backdrop.init(ctx);

    this.props = this.buildProps(ctx);
    this.props.forEach((mesh) => ctx.scene.add(mesh));
    this.disposed = false;
    this.loadBoulders(ctx);

    this.air = findAir(ctx, this.sun.light);
    this.appliedHaze = -1;
    this.breathe();
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.breathe();
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.pool.update();
    this.rill.update();
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
    this.disposed = true;
    this.props.forEach(disposeObject3D);
    this.props = [];
    this.plants = null;
    this.air = null;
    this.backdrop.dispose();
    this.fireflies.dispose();
    this.spores.dispose();
    this.shafts.dispose();
    this.waterfall.dispose();
    this.cave.dispose();
    this.steps.dispose();
    this.bridge.dispose();
    this.rill.dispose();
    this.pool.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.floor.dispose();
    this.groundHaze.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }

  /**
   * Writes the slop's light tint into the fog, the sky and the light: `SLOP_TINT` of the way
   * towards `SLOP_AIR` at full slop.
   */
  private breathe(): void {
    this.hazeNow = this.slopAmount;
    if (!this.air || Math.abs(this.hazeNow - this.appliedHaze) < 1e-4) {
      return;
    }
    const t = this.hazeNow * SLOP_TINT;
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
    this.appliedHaze = this.hazeNow;
  }

  /**
   * Swaps the boulders' procedural stones for the Blender-authored ones once they arrive: each
   * variant's instanced mesh takes a baked copy of its node's geometry, keeping its placements,
   * tints and colliders. The copies are the jungle's own, so the model is handed straight back.
   */
  private loadBoulders(ctx: WorldContext): void {
    ctx.assets.model(ROCKS_MODEL).then(
      (model) => {
        if (!this.disposed) {
          for (const mesh of this.props) {
            const node = mesh.name.startsWith('boulder-') ? model.getObjectByName(mesh.name) : null;
            const geometry = node ? bakeGeometry(node) : null;
            if (geometry) {
              mesh.geometry.dispose();
              mesh.geometry = geometry;
              mesh.boundingSphere = null;
              mesh.computeBoundingSphere();
            }
          }
        }
        ctx.assets.releaseModel(ROCKS_MODEL);
      },
      // A missing model is no error worth showing: the procedural boulders stay.
      () => undefined,
    );
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

    const { plants, canopy } = this.buildFoliage(ctx.quality);
    this.plants = plants;

    return [
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
   * upside down over the bowl. One geometry and two draw calls, the counts set by the tier.
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

function toySpot(place: Placed): ToySpot {
  return { position: new Vector3(place.x, 0, place.z), rotationY: place.yaw };
}

/** The boulders, modelled in Blender (scripts/blender/models/jungle_rocks.py): nodes `boulder-0` and `-1`. */
export const ROCKS_MODEL = 'assets/models/jungle-rocks.glb';

/** Metres either side of their spot the release cairns spread. */
const CAIRN_SPREAD = 1.2;

/**
 * The line the release cairns are laid beside, so they stand across `place`, square to the way it
 * faces: `ReleaseMarkers` lays them `MARKER_OFFSET` behind the line, so the line runs that far in
 * front of the spot, towards the path, and their version labels face it.
 */
function cairnLine(place: Placed): ToyLine {
  const across = new Vector3(Math.cos(place.yaw), 0, -Math.sin(place.yaw));
  const centre = new Vector3(place.x, 0, place.z).addScaledVector(
    new Vector3(Math.sin(place.yaw), 0, Math.cos(place.yaw)),
    MARKER_OFFSET,
  );
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

/**
 * A point in the bowl, clear of its edge by `margin` metres, or `null` when the draw falls outside:
 * every call draws exactly two numbers.
 */
function inBowlPoint(random: Random, margin: number): { x: number; z: number } | null {
  const x = (random() * 2 - 1) * BOWL.rx;
  const z = (random() * 2 - 1) * BOWL.rz;
  return inBowl(x, z) && beyondBowl(x, z) < -margin ? { x, z } : null;
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
 * Stands every plant of `mesh` from `seed` over the bowl: kept off the stage floor, small where
 * visitors walk and up to three times the size out in the groves, leaning a little, in one of five
 * greens. Every candidate draws the same numbers whether it is kept or not, like `scatter`.
 */
function standPlants(mesh: InstancedMesh, seed: number): void {
  const random = seededRandom(seed);
  // The capacity, not `count`: an earlier stand may have drawn fewer.
  const capacity = mesh.instanceMatrix.count;
  const attempts = capacity * 30;
  let placed = 0;

  for (let attempt = 0; attempt < attempts && placed < capacity; attempt++) {
    const at = inBowlPoint(random, EDGE.inset);
    const growth = random() ** 1.6;
    const stretch = between(random, 0.8, 1.3);
    const tiltX = (random() - 0.5) * 0.25;
    const turn = random() * Math.PI * 2;
    const tiltZ = (random() - 0.5) * 0.25;
    const hue = (random() - 0.5) * 0.03;
    const lightness = (random() - 0.5) * 0.08;
    if (!at || isExcluded(at.x, at.z, STAGE_FLOOR)) {
      continue;
    }

    const { x, z } = at;
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
 * so its lowest leaf stays `CANOPY_CLEARANCE` above the visitor and the camera behind them, and
 * none over the view down the axis.
 */
function hangCanopy(mesh: InstancedMesh, seed: number): void {
  const random = seededRandom(seed);
  // The capacity, not `count`: an earlier stand may have drawn fewer.
  const capacity = mesh.instanceMatrix.count;
  const attempts = capacity * 30;
  let placed = 0;

  for (let attempt = 0; attempt < attempts && placed < capacity; attempt++) {
    const at = inBowlPoint(random, 1);
    const size = between(random, 2.5, 5);
    const lift = between(random, 7, 11);
    const tiltX = (random() - 0.5) * 0.6;
    const turn = random() * Math.PI * 2;
    const tiltZ = (random() - 0.5) * 0.6;
    // Its leaves spread round the root and, tilted, swing out by the tilt over their length.
    const reach = size * (CLUSTER.spread + CLUSTER.length * Math.sin(Math.hypot(tiltX, tiltZ)));
    if (!at || isExcluded(at.x, at.z, OPEN_SKY) || isExcluded(at.x, at.z, [viewCorridor(reach)])) {
      continue;
    }

    const { x, z } = at;
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

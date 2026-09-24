import {
  BufferGeometry,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { QualitySettings, QualityTier } from '@engine/capability.service';
import { Interactable } from '@engine/interaction/interactable';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Backdrop } from './backdrop';
import { Basin, basinLevel, pressBasin } from './basin';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
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
import { HIDDEN_PLACE_SHELL, HiddenPlace } from './props/hidden-place';
import { LightShafts } from './light-shafts';
import { DSCHUNGEL, applyMood, clearMood } from './mood';
import { Motes } from './motes';
import { Position, arcAnchors } from './placement';
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

const SIZE = 160;
/** No tall plants inside this radius, so the arrival point stays open and walkable. */
const GLADE_RADIUS = 11;
/** Where exhibits stand: far enough to walk to, near enough to spot through the fog. */
export const EXHIBIT_RADIUS = 19;
/** The arc exhibits are spread over, in radians, centred on the direction the player faces. */
export const EXHIBIT_ARC = Math.PI * 0.9;
/** Radians kept clear beyond both ends of the exhibit arc, for furniture beside an exhibit. */
const ARC_MARGIN = 0.6;
const EDGE = SIZE / 2 - 6;

/** The rock face behind the stage, and the notch (x relative to the face) its waterfall pours from. */
const CLIFF = { x: 0, z: -52, width: 60, height: 16, notch: { x: 9, width: 6 } } as const;
/** The cave behind the waterfall: its back wall sits in the rock, its mouth at the rock's face. */
export const CAVE = { x: CLIFF.x + CLIFF.notch.x, z: CLIFF.z + 1.4 } as const;
/** The plunge pool at the waterfall's foot. */
export const POOL: Basin = { x: CLIFF.x + CLIFF.notch.x, z: CLIFF.z + 6.5, radius: 5, depth: 1.2 };
/** Keep the visual pool full-sized while leaving a capsule-width approach to the waterfall. */
const POOL_COLLIDER_RADIUS = POOL.radius * 0.7;

function relief(x: number, z: number): number {
  return 1.4 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.55 * Math.sin((x - z) * 0.21);
}

export const POOL_LEVEL = basinLevel(relief, POOL);

/** Gentle, non-repeating relief with the plunge pool pressed in; shallow enough to hide nothing. */
export function jungleHeightAt(x: number, z: number): number {
  return pressBasin(relief, POOL, POOL_LEVEL, x, z);
}

const ARC_EDGE = EXHIBIT_ARC / 2 + ARC_MARGIN;

/** Where nothing tall stands: the glade, the exhibit arc with room to either side, the path, and the view to the falls. */
export const STAGE: readonly Exclusion[] = [
  { kind: 'circle', x: 0, z: 0, radius: GLADE_RADIUS },
  { kind: 'arc', x: 0, z: 0, radius: EXHIBIT_RADIUS, halfWidth: 7, from: -ARC_EDGE, to: ARC_EDGE },
  { kind: 'segment', ax: 0, az: 0, bx: 0, bz: -EXHIBIT_RADIUS, halfWidth: 4 },
  { kind: 'segment', ax: 0, az: 0, bx: POOL.x, bz: POOL.z, halfWidth: 6 },
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

/** Where even the undergrowth stays out: the arrival point, the path, the exhibit arc itself, the cliff and the water. */
export const STAGE_FLOOR: readonly Exclusion[] = [
  { kind: 'circle', x: 0, z: 0, radius: 4 },
  {
    kind: 'arc',
    x: 0,
    z: 0,
    radius: EXHIBIT_RADIUS,
    halfWidth: 3.5,
    from: -ARC_EDGE,
    to: ARC_EDGE,
  },
  { kind: 'segment', ax: 0, az: 0, bx: 0, bz: -EXHIBIT_RADIUS, halfWidth: 1.6 },
  { kind: 'circle', x: POOL.x, z: POOL.z, radius: POOL.radius + 0.5 },
  ROCK[0],
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
/** Plants stand this far around the arrival point: the haze has swallowed anything further out. */
const PLANT_AREA = { inner: 4, outer: 40 } as const;
/** Canopy clusters hang over this ring; the arrival point keeps its patch of open sky. */
const CANOPY_AREA = { inner: 5, outer: 36 } as const;
/** Where no canopy hangs: across the view to the falls, over the pool, and against the cliff. */
const OPEN_SKY: readonly Exclusion[] = [
  { kind: 'segment', ax: 0, az: 0, bx: POOL.x, bz: POOL.z, halfWidth: 6 },
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

/** The forest floor at one face: moss, leaf litter, a trodden trail to the exhibit, silt at the pool. */
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
  if (Math.abs(x) < 1.3 && z < -2 && z > -EXHIBIT_RADIUS + 2) {
    scratch.lerp(TRAIL, (1 - Math.abs(x) / 1.3) * 0.8);
  }
  return scratch;
}

/**
 * Dense, close, humid: rainforest giants whose canopy closes overhead, palms and tree ferns, light
 * falling in shafts through the haze, and a waterfall behind the stage — the world behind a portal
 * that should feel like undergrowth.
 */
export class JungleEnvironment implements Environment {
  readonly id = 'jungle' as const;
  readonly name = 'Dschungel';
  readonly spawn = new Vector3(0, jungleHeightAt(0, 0), 0);
  readonly spawnYaw = 0;
  /** The light and air of this place; the scene reads it to match whatever stands in it. */
  readonly mood = DSCHUNGEL;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(DSCHUNGEL);
  readonly colliders: readonly Collider[];
  /** A nook behind the waterfall. It holds a stone and nothing else: no text, no tally. */
  readonly cave: HiddenPlace;
  readonly interactables: readonly Interactable[];

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: 120,
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
    level: POOL_LEVEL,
    ground: this.floor,
    colours: { shallow: 0x6fa89a, deep: 0x1f4a45, foam: 0xf0fff8 },
  });
  private readonly waterfall = new Waterfall({
    shared: this.shared,
    mood: DSCHUNGEL,
    lip: [POOL.x, this.lipHeight, CLIFF.z + 2],
    width: 4.5,
    drop: this.lipHeight - POOL_LEVEL,
    rotationY: 0,
    colours: { water: 0xcfeee6, foam: 0xffffff },
  });
  private readonly shafts = new LightShafts({
    shared: this.shared,
    colour: 0xf2ffd0,
    intensity: 2,
    shafts: [
      { x: 0, z: -8, radius: 1.6, height: 30 },
      { x: -6, z: -16, radius: 1.2, height: 30 },
      { x: 5, z: -23, radius: 2.0, height: 30 },
      { x: 10, z: -6, radius: 1.4, height: 30 },
      { x: -12, z: -4, radius: 2.2, height: 30 },
      { x: 3, z: -34, radius: 1.8, height: 30 },
      { x: -4, z: -28, radius: 1.3, height: 30 },
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
    area: { x: 0, z: -20, radius: 30, minY: 0.3, maxY: 2.2 },
    followCamera: false,
    heightAt: jungleHeightAt,
    colour: 0xd8ff7a,
    size: 0.07,
    glow: 4,
    directGlow: 1.3,
    drift: 1.5,
    flicker: 1,
  });
  private readonly backdrop = new Backdrop(
    [
      {
        radius: 110,
        depth: 60,
        height: 30,
        roughness: 0.8,
        color: 0x2f5a3a,
        haze: 0.35,
        seed: 111,
      },
      { radius: 170, depth: 80, height: 45, roughness: 0.7, color: 0x3f6a55, haze: 0.6, seed: 112 },
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

  constructor(private readonly options: EnvironmentOptions) {
    const exclusions = [...STAGE, ...ROCK];
    this.groves = {
      kapok: scatter(
        {
          seed: 51,
          count: 16,
          area: { inner: 24, outer: EDGE },
          scale: [0.85, 1.15],
          minSpacing: 9,
          exclusions,
        },
        this.floor,
      ),
      palms: scatter(
        {
          seed: 52,
          count: 24,
          area: { inner: 13, outer: EDGE },
          clusters: { count: 6, radius: 8 },
          scale: [0.85, 1.2],
          minSpacing: 4,
          exclusions,
        },
        this.floor,
      ),
      ferns: scatter(
        {
          seed: 53,
          count: 30,
          area: { inner: 12, outer: EDGE },
          scale: [0.8, 1.3],
          minSpacing: 2.5,
          exclusions,
        },
        this.floor,
      ),
      boulders: scatter(
        {
          seed: 54,
          count: 16,
          area: { inner: 12, outer: EDGE },
          scale: [0.7, 1.5],
          minSpacing: 4,
          exclusions,
        },
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

  /** An arc in front of the arrival point, each exhibit turned back towards it. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    return arcAnchors(count, avoid, EXHIBIT_RADIUS, EXHIBIT_ARC);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, DSCHUNGEL);

    this.floor.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.pool.init(ctx);
    this.waterfall.init(ctx);
    this.shafts.init(ctx);
    this.spores.init(ctx);
    this.fireflies.init(ctx);
    this.backdrop.init(ctx);
    this.cave.init(ctx);

    this.props = this.buildProps(ctx);
    this.props.forEach((mesh) => ctx.scene.add(mesh));
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.pool.update();
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
    this.backdrop.dispose();
    this.fireflies.dispose();
    this.spores.dispose();
    this.shafts.dispose();
    this.waterfall.dispose();
    this.pool.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.floor.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
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

/** A point spread evenly over the annulus: every call draws exactly two numbers. */
function ringPoint(random: Random, area: { readonly inner: number; readonly outer: number }) {
  const radius = Math.sqrt(between(random, area.inner ** 2, area.outer ** 2));
  const angle = random() * Math.PI * 2;
  return { x: Math.sin(angle) * radius, z: -Math.cos(angle) * radius };
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
    const { x, z } = ringPoint(random, PLANT_AREA);
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
    const { x, z } = ringPoint(random, CANOPY_AREA);
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

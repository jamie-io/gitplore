import { Color, InstancedMesh, MeshStandardMaterial, Vector3 } from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Backdrop } from './backdrop';
import { Basin, basinLevel, pressBasin } from './basin';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
import {
  CLIFF_LIP,
  bigLeafPlant,
  cliffWall,
  groundFern,
  kapokTree,
  liana,
  mossyBoulder,
  palmTree,
  treeFern,
} from './flora';
import { ProceduralGround } from './ground';
import { LightShafts } from './light-shafts';
import { DSCHUNGEL, applyMood, clearMood } from './mood';
import { Motes } from './motes';
import { Position, arcAnchors } from './placement';
import { valueNoise } from './random';
import {
  Exclusion,
  Placement,
  buildInstanced,
  cylinderColliders,
  foliageTint,
  scatter,
  stoneTint,
  variants,
} from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { withDapple } from './shaders/dapple';
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
/** The plunge pool at the waterfall's foot. */
export const POOL: Basin = { x: CLIFF.x + CLIFF.notch.x, z: CLIFF.z + 6.5, radius: 5, depth: 1.2 };

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

/** Where even ferns stay out: the arrival point, the path, the exhibit arc itself, the cliff and the water. */
const STAGE_FLOOR: readonly Exclusion[] = [
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

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: 120,
    heightAt: jungleHeightAt,
    colorAt: jungleGround,
    decorate: (material) =>
      void withDapple(withAtmosphere(material, this.shared), this.shared, 0.75),
  });
  private readonly cliffBase = jungleHeightAt(CLIFF.x, CLIFF.z);
  private readonly lipHeight = this.cliffBase + CLIFF.height * CLIFF_LIP;
  private readonly sky = new Sky({ mood: DSCHUNGEL, shared: this.shared });
  private readonly sun = new Sun({ mood: DSCHUNGEL, shared: this.shared });
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

    this.colliders = [
      {
        kind: 'aabb',
        minX: CLIFF.x - CLIFF.width / 2 - 1,
        maxX: CLIFF.x + CLIFF.width / 2 + 1,
        minZ: CLIFF.z - 4,
        maxZ: CLIFF.z + 2.5,
      },
      { kind: 'cylinder', x: POOL.x, z: POOL.z, radius: POOL.radius * 0.9 },
      ...cylinderColliders(this.groves.kapok, 0.9),
      ...cylinderColliders(this.groves.palms, 0.25),
      ...cylinderColliders(this.groves.ferns, 0.22),
      ...cylinderColliders(this.groves.boulders, 0.95),
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

  dispose(): void {
    this.props.forEach(disposeObject3D);
    this.props = [];
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
    const density = ctx.quality.propDensity;
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

    const leaves = scatter(
      {
        seed: 61,
        count: Math.round(110 * density),
        area: { inner: 5, outer: EDGE },
        clusters: { count: 16, radius: 6 },
        scale: [0.8, 1.4],
        exclusions: STAGE_FLOOR,
      },
      this.floor,
    );
    const fronds = scatter(
      {
        seed: 62,
        count: Math.round(600 * density),
        area: { inner: 4, outer: EDGE },
        clusters: { count: 30, radius: 7 },
        scale: [0.7, 1.4],
        exclusions: STAGE_FLOOR,
      },
      this.floor,
    );
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
      cliffWall(71, CLIFF.width, CLIFF.height, CLIFF.notch),
      still,
      [{ x: CLIFF.x, y: this.cliffBase, z: CLIFF.z, scale: 1, rotation: 0, tint: 0 }],
      { name: 'cliff', castShadow: shadows, receiveShadow: shadows },
    );

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
      ...variants(bigLeafPlant, [10, 11], leaves, leafy(1.8), {
        name: 'big-leaf',
        castShadow: shadows,
        tint: foliageTint,
      }),
      ...variants(groundFern, [12, 13], fronds, leafy(0.6), { name: 'fern', tint: foliageTint }),
      ...variants(liana, [14, 15, 16], vines, still, { name: 'liana', tint: foliageTint }),
    ];
  }
}

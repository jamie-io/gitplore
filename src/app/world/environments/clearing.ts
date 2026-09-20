import { Color, InstancedMesh, MeshStandardMaterial, Vector3 } from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Backdrop } from './backdrop';
import { Butterflies } from './butterflies';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
import {
  birchTree,
  boulder,
  broadleafTree,
  bush,
  flowerTuft,
  lilyPad,
  pineTree,
  reeds,
} from './flora';
import { GrassField } from './grass';
import { LICHTUNG, applyMood, clearMood } from './mood';
import { Monument } from './monument';
import { Motes } from './motes';
import { OUTER_RING_RADIUS, Position, RING_RADIUS, ringPlacements } from './placement';
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
import { SharedUniforms } from './shaders/shared-uniforms';
import { withWind } from './shaders/wind';
import { Sky } from './sky';
import { Sun } from './sun';
import { POND, POND_WATER_LEVEL, TERRAIN_SIZE, Terrain, terrainGlsl } from './terrain';
import { Water } from './water';

/** Metres around the spawn kept open: the meadow the visitor arrives on. */
const MEADOW_RADIUS = 12;
/** Half-width of the band around the landmark ring where nothing tall grows. */
const RING_BAND = 8;
/** Half-width of the worn path along the ring and down the spoke to the pinned portal. */
const PATH_HALF_WIDTH = 1.6;
/** Where the monument stands: `Monument`'s own default. */
const MONUMENT = new Vector3(0, 0, 9);
/** Scatter stops short of the terrain's edge, so nothing overhangs it. */
const EDGE = TERRAIN_SIZE / 2 - 6;
/** Grass keeps this far from every landmark's centre. */
const LANDMARK_CLEARANCE = 3.5;
/** Radii used by current and future bearing slots; paths follow these, not a guessed circle. */
const OCCUPIED_RING_RADII = [RING_RADIUS, OUTER_RING_RADIUS] as const;
const FARTHEST_RING_RADIUS = Math.max(...OCCUPIED_RING_RADII);

/** Where nothing tall grows: the meadow, the portal ring, the spoke, the monument and the pond. */
export const OPEN_GROUND: readonly Exclusion[] = [
  { kind: 'circle', x: 0, z: 0, radius: MEADOW_RADIUS },
  ...OCCUPIED_RING_RADII.map((radius): Exclusion => ({
    kind: 'ring',
    x: 0,
    z: 0,
    inner: radius - RING_BAND,
    outer: radius + RING_BAND,
  })),
  { kind: 'segment', ax: 0, az: 0, bx: 0, bz: -FARTHEST_RING_RADIUS, halfWidth: 4 },
  { kind: 'circle', x: MONUMENT.x, z: MONUMENT.z, radius: 5 },
  { kind: 'circle', x: POND.x, z: POND.z, radius: POND.radius * 1.4 },
];

/** The worn path: no grass, no flowers. */
const PATHS: readonly Exclusion[] = [
  ...OCCUPIED_RING_RADII.map((radius): Exclusion => ({
    kind: 'ring',
    x: 0,
    z: 0,
    inner: radius - PATH_HALF_WIDTH,
    outer: radius + PATH_HALF_WIDTH,
  })),
  {
    kind: 'segment',
    ax: 0,
    az: -2,
    bx: 0,
    bz: -FARTHEST_RING_RADIUS,
    halfWidth: PATH_HALF_WIDTH,
  },
];
const WATER: Exclusion = { kind: 'circle', x: POND.x, z: POND.z, radius: POND.radius * 1.02 };
const MONUMENT_FOOT: Exclusion = { kind: 'circle', x: MONUMENT.x, z: MONUMENT.z, radius: 3.8 };

const FLOWER_COLOURS = [0xf4f1e8, 0xf2c94c, 0xb7a1e0, 0xd9483b] as const;

const MEADOW = new Color(0x6f9c42);
const MEADOW_SUNLIT = new Color(0xa9b953);
const HOLLOW = new Color(0x466e2e);
const PATH = new Color(0x9c7d56);
const SHORE = new Color(0x7a6848);
const ROCK = new Color(0x8b8373);
const scratch = new Color();

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The meadow's colour at one terrain face: sunny crowns, deep hollows, rock on steep faces, a
 * muddy shore and the worn path. Returns one shared instance, which `ProceduralGround` copies at once.
 */
export function lichtungGround(x: number, z: number, height: number, slope: number): Color {
  const patch = valueNoise(x * 0.045, z * 0.045, 3);
  scratch
    .copy(HOLLOW)
    .lerp(MEADOW, clamp01((height + 2.5) / 4))
    .lerp(MEADOW_SUNLIT, clamp01(patch - 0.35) * 0.9);
  if (slope > 0.3) {
    scratch.lerp(ROCK, clamp01((slope - 0.3) * 2.5));
  }
  const toPond = Math.hypot(x - POND.x, z - POND.z);
  if (toPond < POND.radius * 1.25) {
    scratch.lerp(SHORE, clamp01((POND.radius * 1.25 - toPond) / (POND.radius * 0.35)));
  }
  const worn = pathWear(x, z);
  if (worn > 0) {
    scratch.lerp(PATH, worn);
  }
  return scratch;
}

function pathWear(x: number, z: number): number {
  const ring = Math.min(
    ...OCCUPIED_RING_RADII.map((radius) => Math.abs(Math.hypot(x, z) - radius)),
  );
  const spoke = z < -2 && z > -FARTHEST_RING_RADIUS ? Math.abs(x) : Infinity;
  const distance = Math.min(ring, spoke);
  return (
    clamp01((PATH_HALF_WIDTH - distance) / PATH_HALF_WIDTH) *
    (0.75 + 0.25 * valueNoise(x * 0.4, z * 0.4, 9))
  );
}

/**
 * The open ground the visitor starts on, late on a golden afternoon: a meadow of grass and
 * wildflowers, groves beyond the portal ring, a pond towards the low sun and hazy hills on the
 * horizon. Everything is procedural and cheap to rebuild, which is what lets the start world be
 * disposed when the visitor walks through a portal and built again when they come back.
 */
export class ClearingEnvironment implements Environment {
  readonly id = 'clearing' as const;
  readonly name = 'Lichtung';
  readonly spawn = new Vector3(0, 0, 0);
  readonly spawnYaw = 0;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(LICHTUNG);
  readonly colliders: readonly Collider[];

  private readonly terrain = new Terrain({
    colorAt: lichtungGround,
    decorate: (material) => void withAtmosphere(material, this.shared),
  });
  private readonly monument = new Monument(MONUMENT.clone());
  private readonly sky = new Sky({ mood: LICHTUNG, shared: this.shared });
  private readonly sun = new Sun({ mood: LICHTUNG, shared: this.shared });
  private readonly pond = new Water({
    shared: this.shared,
    mood: LICHTUNG,
    centre: [POND.x, POND.z],
    radius: POND.radius,
    level: POND_WATER_LEVEL,
    ground: this.terrain,
    colours: { shallow: 0x7fb8a8, deep: 0x2f5f6f, foam: 0xf4f1e8 },
  });
  private readonly grass = new GrassField({
    shared: this.shared,
    heightGlsl: terrainGlsl(),
    // A smaller circle packed denser: 20 blades a square metre read as a meadow, 5 read as
    // stubble, and past 30 m the ground's own face colours carry the grass to the horizon.
    radius: 34,
    blades: 90000,
    height: 0.45,
    colours: { root: 0x467a2c, tip: 0xb9cf5c, dry: 0xd0b565 },
    bare: [...PATHS, WATER, MONUMENT_FOOT],
  });
  private readonly backdrop = new Backdrop(
    [
      {
        radius: 175,
        depth: 90,
        height: 26,
        roughness: 0.25,
        color: 0x5c8a48,
        haze: 0.22,
        seed: 101,
      },
      {
        radius: 260,
        depth: 110,
        height: 48,
        roughness: 0.6,
        color: 0x7b95ae,
        haze: 0.5,
        seed: 102,
      },
    ],
    LICHTUNG.fog.color,
  );
  private readonly pollen = new Motes({
    shared: this.shared,
    seed: 201,
    count: 320,
    area: { x: 0, z: 0, radius: 24, minY: -1.2, maxY: 2.5 },
    followCamera: true,
    colour: 0xfff1c4,
    size: 0.03,
    // Just over 1, so a mote catches the bloom as a spark and not as a second sun when one
    // drifts past the lens.
    glow: 1.2,
    drift: 1.2,
    flicker: 0.15,
  });
  private readonly butterflies = new Butterflies({
    shared: this.shared,
    seed: 301,
    count: 14,
    area: { x: 0, z: -10, radius: 45, height: 1.4 },
    colours: [0xf2c94c, 0xf4f1e8, 0xe07b39, 0x9fb7e8],
    ground: this.terrain,
  });

  /** Tall things, placed before `init` because they collide; their counts never depend on the tier. */
  private readonly groves: {
    readonly broadleaf: readonly Placement[];
    readonly birch: readonly Placement[];
    readonly pine: readonly Placement[];
    readonly boulders: readonly Placement[];
  };
  /** Every landmark footprint, pinned and generated, recorded when the scene asks for anchors. */
  private reserved: readonly Position[] = [];
  private props: InstancedMesh[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {
    const exclusions = OPEN_GROUND;
    this.groves = {
      broadleaf: scatter(
        {
          seed: 11,
          count: 70,
          area: { inner: 40, outer: EDGE },
          clusters: { count: 10, radius: 12 },
          scale: [0.85, 1.35],
          minSpacing: 3.2,
          exclusions,
        },
        this.terrain,
      ),
      birch: scatter(
        {
          seed: 12,
          count: 28,
          area: { inner: 38, outer: 95 },
          clusters: { count: 6, radius: 7 },
          scale: [0.9, 1.25],
          minSpacing: 2.2,
          exclusions,
        },
        this.terrain,
      ),
      pine: scatter(
        {
          seed: 13,
          count: 45,
          area: { inner: 75, outer: EDGE },
          scale: [0.9, 1.5],
          minSpacing: 3.5,
          exclusions,
        },
        this.terrain,
      ),
      boulders: scatter(
        {
          seed: 14,
          count: 20,
          area: { inner: 16, outer: EDGE },
          scale: [0.6, 1.6],
          minSpacing: 4,
          exclusions,
        },
        this.terrain,
      ),
    };

    this.colliders = [
      ...this.monument.colliders,
      { kind: 'cylinder', x: POND.x, z: POND.z, radius: POND.radius * 0.95 },
      ...cylinderColliders(this.groves.broadleaf, 0.3),
      ...cylinderColliders(this.groves.birch, 0.18),
      ...cylinderColliders(this.groves.pine, 0.25),
      ...cylinderColliders(this.groves.boulders, 0.95),
    ];
  }

  get ground(): HeightField {
    return this.terrain;
  }

  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const anchors = ringPlacements(count, avoid);
    // The start world asks once, in the scene's constructor, before `init`: remember every
    // landmark's footprint so the grass leaves room around each of them.
    this.reserved = [...avoid, ...anchors.map((anchor) => anchor.position)];
    return anchors;
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, LICHTUNG);

    this.terrain.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.monument.init(ctx);
    this.pond.init(ctx);
    this.grass.setClearings(
      this.reserved.map(([x, , z]) => ({ x, z, radius: LANDMARK_CLEARANCE })),
    );
    this.grass.init(ctx);
    this.backdrop.init(ctx);
    this.pollen.init(ctx);
    this.butterflies.init(ctx);

    this.props = this.buildProps(ctx);
    this.props.forEach((mesh) => ctx.scene.add(mesh));
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.monument.update();
    this.pond.update();
    this.grass.update();
    this.pollen.update();
    this.butterflies.update();
  }

  dispose(): void {
    this.props.forEach(disposeObject3D);
    this.props = [];
    this.butterflies.dispose();
    this.pollen.dispose();
    this.backdrop.dispose();
    this.grass.dispose();
    this.pond.dispose();
    this.monument.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.terrain.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }

  private buildProps(ctx: WorldContext): InstancedMesh[] {
    const shadows = ctx.quality.shadows;
    const density = ctx.quality.propDensity;
    // The gust field costs a handful of noise look-ups per vertex, which the software renderer
    // on the weakest tier feels across a hundred thousand flower and leaf vertices; that tier
    // keeps the meadow's grass swaying and holds the trees still, like its clouds are compiled out.
    const sways = ctx.quality.shaderDetail > 0;
    const leafy = (height: number) => {
      const material = withAtmosphere(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
        this.shared,
      );
      return sways
        ? withWind(material, this.shared, { amplitude: height * 0.03, height })
        : material;
    };
    const solid = withAtmosphere(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
      this.shared,
    );
    const tall = { castShadow: shadows, receiveShadow: shadows, tint: foliageTint, sink: 0.1 };

    const bushes = scatter(
      {
        seed: 20,
        count: Math.round(90 * density),
        area: { inner: 14, outer: EDGE },
        clusters: { count: 12, radius: 8 },
        scale: [0.7, 1.4],
        exclusions: OPEN_GROUND,
      },
      this.terrain,
    );
    const reedBeds = scatter(
      {
        seed: 21,
        count: Math.round(70 * density),
        area: { x: POND.x, z: POND.z, inner: POND.radius * 0.8, outer: POND.radius * 1.15 },
        scale: [0.8, 1.3],
      },
      this.terrain,
    );
    const pads = scatter(
      {
        seed: 22,
        count: 14,
        area: { x: POND.x, z: POND.z, inner: 0, outer: POND.radius * 0.7 },
        scale: [0.7, 1.4],
        minSpacing: 1,
      },
      this.terrain,
    ).map((pad) => ({ ...pad, y: POND_WATER_LEVEL + 0.01 }));
    const flowers = FLOWER_COLOURS.map((colour, index) =>
      buildInstanced(
        flowerTuft(40 + index, colour),
        leafy(0.5),
        scatter(
          {
            seed: 30 + index,
            // Only where a blossom is still more than a speck: past 60 m they cost vertices
            // (wind and haze run per vertex) and show nothing. Steeper than the density itself
            // on the way down: flowers are the biggest vertex bill after the grass.
            count: Math.round(360 * density ** 1.5),
            area: { inner: 6, outer: 60 },
            clusters: { count: 14, radius: 6 },
            scale: [0.8, 1.3],
            exclusions: [...PATHS, WATER, MONUMENT_FOOT],
          },
          this.terrain,
        ),
        { name: `flowers-${index}` },
      ),
    );

    return [
      ...variants(broadleafTree, [1, 2, 3], this.groves.broadleaf, leafy(5.5), {
        name: 'broadleaf',
        ...tall,
      }),
      ...variants(birchTree, [4, 5], this.groves.birch, leafy(6), { name: 'birch', ...tall }),
      ...variants(pineTree, [6, 7], this.groves.pine, leafy(5.3), { name: 'pine', ...tall }),
      ...variants(boulder, [8, 9, 10], this.groves.boulders, solid, {
        name: 'boulder',
        castShadow: shadows,
        receiveShadow: shadows,
        tint: stoneTint,
      }),
      ...variants(bush, [11, 12], bushes, leafy(1.2), {
        name: 'bush',
        castShadow: shadows,
        tint: foliageTint,
      }),
      buildInstanced(reeds(13), leafy(1.6), reedBeds, { name: 'reeds', tint: foliageTint }),
      buildInstanced(lilyPad(14), solid, pads, { name: 'lily-pads' }),
      ...flowers,
    ];
  }
}

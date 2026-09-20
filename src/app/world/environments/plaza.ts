import {
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import {
  FOUNTAIN,
  HouseOptions,
  LAMP_GLASS,
  MAST_TOP,
  bench,
  cypress,
  festoon,
  fountain,
  house,
  lampPost,
  mast,
  pottedOlive,
} from './architecture';
import { Backdrop, HillRing } from './backdrop';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
import { assemble, paint } from './flora';
import { FountainJets } from './fountain-jets';
import { ProceduralGround } from './ground';
import { PLAZA, applyMood, clearMood } from './mood';
import { Position, arcAnchors } from './placement';
import { Random, between, seededRandom } from './random';
import { Placement, buildInstanced, foliageTint } from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { SharedUniforms } from './shaders/shared-uniforms';
import { withTiles } from './shaders/tiles';
import { withWind } from './shaders/wind';
import { Sky } from './sky';
import { Sun } from './sun';
import { Water } from './water';

const SIZE = 130;
/** Radius of the semicircle the exhibits stand on. */
export const EXHIBIT_RADIUS = 20;
export const EXHIBIT_ARC = Math.PI * 1.1;
/** Distance from the centre to the house fronts on every side. */
const FACADE = 36;
const HOUSE_DEPTH = 9;
/** Half-width of the street opening in the middle of each side. */
const STREET = 5;
/** Where cypresses and pots line the square, just in front of the houses. */
const PLANTING = 33;

/**
 * Pastels that stay apart in full sun: ochre, apricot, rose, cream, salmon, sage, powder blue and
 * lemon. The first cut was six sands and creams, which read as one beige wall at noon.
 */
const STUCCO = [
  0xe8c48a, 0xf0b98f, 0xeab4ae, 0xf2e4c8, 0xe39a7c, 0xc4d2b0, 0xb8cadb, 0xf0d88c,
] as const;
const SHUTTERS = [0x2f7f78, 0x5f8f35, 0x35609a, 0x8f4535, 0x3f8fa0] as const;
/** Render order of everything that stands on the square, ahead of the floor, hills and sky. */
const OCCLUDERS_FIRST = -1;
/** Festoon bulbs: warm white, then amber, rose and turquoise; see `init`. */
const BULB_COLOURS = [0xffe2b0, 0xffa640, 0xff6f8a, 0x5fd8d0] as const;
/** Linear brightness of a bulb: over 1, so bloom catches it, but not a night-time glare. */
const BULB_GLOW = 2.6;
/** The near hills, seen through every street, and the far range that shows over their crests. */
const HILLS: readonly HillRing[] = [
  { radius: 140, depth: 70, height: 35, roughness: 0.4, color: 0x8f9a6a, haze: 0.3, seed: 121 },
  { radius: 220, depth: 90, height: 55, roughness: 0.6, color: 0x8fa3b8, haze: 0.6, seed: 122 },
];
const AWNINGS = [0x2f6f9f, 0xc2502f, 0x5f8f35, 0xd9a02f] as const;

type Side = 'north' | 'south' | 'west' | 'east';

interface HouseSpot {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly seed: number;
  readonly options: HouseOptions;
}

const CYPRESSES: readonly (readonly [number, number])[] = [9.5, 18.5, 27.5]
  .flatMap((along) => [-along, along])
  .flatMap((along) => [
    [along, -PLANTING] as const,
    [along, PLANTING] as const,
    [-PLANTING, along] as const,
    [PLANTING, along] as const,
  ]);
const POTS: readonly (readonly [number, number])[] = [
  [-6.5, -34],
  [6.5, -34],
  [-6.5, 34],
  [6.5, 34],
  [-34, -6.5],
  [-34, 6.5],
  [34, -6.5],
  [34, 6.5],
];
const LAMPS: readonly (readonly [number, number])[] = [
  [12, -28],
  [-12, -28],
  [12, 28],
  [-12, 28],
  [28, 12],
  [28, -12],
  [-28, 12],
  [-28, -12],
];
const MASTS: readonly (readonly [number, number])[] = [
  [22, 22],
  [-22, 22],
  [22, -22],
  [-22, -22],
];
const BENCHES: readonly (readonly [number, number, number])[] = Array.from(
  { length: 6 },
  (_, index) => {
    const angle = Math.PI / 6 + (index * Math.PI) / 3;
    // Local +Z (the seat's front) turned towards the fountain.
    return [Math.sin(angle) * 8, -Math.cos(angle) * 8, -angle] as const;
  },
);

function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

/** One side of the square: houses of varied width shoulder to shoulder, a street in the middle. */
export function houseRow(side: Side, seed: number): HouseSpot[] {
  const random = seededRandom(seed);
  // North and south run the full width including the corners; west and east fill in between.
  const extent = side === 'north' || side === 'south' ? FACADE + HOUSE_DEPTH + 1 : FACADE;
  const centre = FACADE + HOUSE_DEPTH / 2;
  const spots: HouseSpot[] = [];

  for (const [from, to] of [
    [-extent, -STREET],
    [STREET, extent],
  ] as const) {
    let at = from;
    while (to - at >= 5) {
      const width = Math.min(between(random, 6, 9), to - at);
      const along = at + width / 2;
      const options: HouseOptions = {
        width,
        depth: HOUSE_DEPTH,
        height: between(random, 7, 11),
        stucco: pick(random, STUCCO),
        shutters: pick(random, SHUTTERS),
        awning: random() < 0.4 ? pick(random, AWNINGS) : undefined,
        flowers: random() < 0.5,
      };
      const houseSeed = Math.floor(random() * 1e6);
      spots.push(
        side === 'north'
          ? { x: along, z: -centre, rotationY: 0, seed: houseSeed, options }
          : side === 'south'
            ? { x: along, z: centre, rotationY: Math.PI, seed: houseSeed, options }
            : side === 'west'
              ? { x: -centre, z: along, rotationY: Math.PI / 2, seed: houseSeed, options }
              : { x: centre, z: along, rotationY: -Math.PI / 2, seed: houseSeed, options },
      );
      at += width;
    }
  }
  return spots;
}

function footprint(spot: HouseSpot): Collider {
  const facesZ = spot.rotationY === 0 || spot.rotationY === Math.PI;
  const halfX = (facesZ ? spot.options.width : HOUSE_DEPTH) / 2;
  const halfZ = (facesZ ? HOUSE_DEPTH : spot.options.width) / 2;
  return {
    kind: 'aabb',
    minX: spot.x - halfX,
    maxX: spot.x + halfX,
    minZ: spot.z - halfZ,
    maxZ: spot.z + halfZ,
  };
}

function placed(geometry: BufferGeometry, x: number, z: number, rotationY: number): BufferGeometry {
  return geometry.applyMatrix4(new Matrix4().makeRotationY(rotationY).setPosition(x, 0, z));
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) {
    throw new Error('plaza parts do not share the same attributes');
  }
  return geometry;
}

function at([x, z]: readonly [number, number], scale = 1, rotation = 0): Placement {
  return { x, y: 0, z, scale, rotation, tint: ((((x * 7 + z * 13) % 10) + 10) % 10) / 10 };
}

/** A basin floor that shallows towards the kerb, so the water foams along it. */
function basinFloor(level: number, radius: number, depth: number): HeightField {
  return {
    heightAt: (x, z) => level - depth * Math.min(1, Math.max(0, (radius - Math.hypot(x, z)) / 0.8)),
  };
}

/**
 * A Mediterranean square at noon: a tiled floor with a mosaic ring, a two-tier fountain, pastel
 * houses on every side with a street through the middle of each, cypresses, benches, lamps and
 * string lights, hills beyond the streets.
 */
export class PlazaEnvironment implements Environment {
  readonly id = 'plaza' as const;
  readonly name = 'Plaza';
  /** Keeps the arrival clear of the fountain while bringing its first exhibit within 25 m. */
  readonly spawn = new Vector3(-8, 0, 4.2);
  readonly spawnYaw = -0.22;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(PLAZA);
  readonly colliders: readonly Collider[];

  private readonly houses: readonly HouseSpot[] = [
    ...houseRow('north', 81),
    ...houseRow('south', 82),
    ...houseRow('west', 83),
    ...houseRow('east', 84),
  ];
  private floorDetail: 0 | 1 | 2 = 0;

  private readonly floor = new ProceduralGround({
    id: 'plaza-floor',
    size: SIZE,
    color: 0xd9cdb5,
    segments: 1,
    heightAt: () => 0,
    decorate: (material) => {
      const tiled = withTiles(material, {
        size: 1.1,
        grout: 0.035,
        groutColour: 0x9a9080,
        // Travertine: close in value, so the square reads as one warm stone rather than a
        // chequerboard; the shader adds each stone's own shade on top.
        colours: [0xddd0b6, 0xd5c6aa, 0xe2d6bf, 0xd2c0a2],
        pattern: 'grid',
        ring: {
          x: 0,
          z: 0,
          inner: 5.2,
          outer: 9.8,
          colours: [0x3f6f8f, 0xd9cdb5, 0xb8583a, 0xe8c9a0],
        },
        roughness: { min: 0.55, max: 0.9 },
        detail: this.floorDetail,
      });
      // The lowest tier leaves the floor to the plain distance fog, which is all but clear across
      // the square: the height-fog integral cost the software renderer about 2.5 ms a frame on
      // the half of the screen the floor fills, for a haze of a few per cent.
      if (this.floorDetail > 0) {
        withAtmosphere(tiled, this.shared);
      }
    },
  });
  private readonly sky = new Sky({ mood: PLAZA, shared: this.shared });
  private readonly sun = new Sun({ mood: PLAZA, shared: this.shared });
  private readonly lowerPool = new Water({
    shared: this.shared,
    mood: PLAZA,
    centre: [0, 0],
    radius: FOUNTAIN.lower.radius,
    level: FOUNTAIN.lower.level,
    ground: basinFloor(FOUNTAIN.lower.level, FOUNTAIN.lower.radius, 0.5),
    colours: { shallow: 0x6cc2cf, deep: 0x1f6f95, foam: 0xffffff },
  });
  private readonly upperPool = new Water({
    shared: this.shared,
    mood: PLAZA,
    centre: [0, 0],
    radius: FOUNTAIN.upper.radius,
    level: FOUNTAIN.upper.level,
    ground: basinFloor(FOUNTAIN.upper.level, FOUNTAIN.upper.radius, 0.25),
    colours: { shallow: 0x6cc2cf, deep: 0x2f7fa5, foam: 0xffffff },
  });
  private readonly jets = new FountainJets({
    shared: this.shared,
    origin: [...FOUNTAIN.spout],
    jets: 8,
    reach: 3,
    height: 1.0,
    landing: FOUNTAIN.lower.level,
    colour: 0xe8f8ff,
  });
  private backdrop: Backdrop | null = null;
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {
    this.colliders = [
      { kind: 'cylinder', x: 0, z: 0, radius: FOUNTAIN.radius + 0.2 },
      ...this.houses.map(footprint),
      ...CYPRESSES.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.5 })),
      ...POTS.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.6 })),
      ...LAMPS.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.3 })),
      ...MASTS.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.25 })),
      ...BENCHES.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 1.0 })),
    ];
  }

  get ground() {
    return this.floor;
  }

  /** A semicircle around the fountain, every exhibit facing the middle of the square. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    return arcAnchors(count, avoid, EXHIBIT_RADIUS, EXHIBIT_ARC);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, PLAZA);
    const detail = ctx.quality.shaderDetail;
    this.floorDetail = detail;
    const shadows = ctx.quality.shadows;

    this.floor.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.lowerPool.init(ctx);
    this.upperPool.init(ctx);
    this.jets.init(ctx);
    // The far range mostly stands behind the near one, yet the software renderer behind the
    // lowest tier still rasterises all of it: about 2.5 ms a frame. That tier keeps the near hills.
    this.backdrop = new Backdrop(detail > 0 ? HILLS : HILLS.slice(0, 1), PLAZA.fog.color);
    this.backdrop.init(ctx);

    const solid = withAtmosphere(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
      this.shared,
    );
    const leafy = (height: number) =>
      withWind(
        withAtmosphere(
          new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
          this.shared,
        ),
        this.shared,
        { amplitude: height * 0.02, height },
      );

    const town = new Mesh(
      merged(
        this.houses.map((spot) =>
          placed(house(spot.seed, spot.options), spot.x, spot.z, spot.rotationY),
        ),
      ),
      solid,
    );
    town.name = 'houses';
    town.castShadow = shadows;
    town.receiveShadow = shadows;

    const centrepiece = new Mesh(fountain(), solid);
    centrepiece.name = 'fountain';
    centrepiece.castShadow = shadows;
    centrepiece.receiveShadow = shadows;

    const strings = MASTS.flatMap(([x, z], index) => {
      const next = MASTS[(index + 1) % MASTS.length];
      return [
        festoon(new Vector3(x, MAST_TOP, z), new Vector3(next[0], MAST_TOP, next[1]), 2.5, 30),
      ];
    }).concat([
      festoon(new Vector3(22, MAST_TOP, 22), new Vector3(-22, MAST_TOP, -22), 1.0, 36),
      festoon(new Vector3(-22, MAST_TOP, 22), new Vector3(22, MAST_TOP, -22), 1.0, 36),
    ]);
    const wires = new Mesh(merged(strings.map((string) => string.wire)), solid);
    wires.name = 'festoon-wires';

    // Every fourth string bulb is warm white and the others take a festival colour in turn, so
    // the strings still read as lights at noon, when a white bulb is lost against the sky. The
    // lamps keep a warm white. Unlit and above 1 in linear, so the strongest tier blooms them a
    // little; the medium and low tiers draw them as flat, bright dots. One merged mesh rather
    // than 200 instances: the software renderer behind the low tier paid about 3 ms a frame for
    // the instanced draw of these specks, and a single mesh of 12 000 vertices costs next to none.
    // `assemble`, not a bare merge: it restores the normals `paint` strips, which the strongest
    // tier's ambient-occlusion pass reads; without them it blacked the bulbs out.
    const bulbs = new Mesh(
      assemble([
        ...strings.flatMap((string) =>
          string.bulbs.map((bulb, index) =>
            paint(
              new IcosahedronGeometry(0.08, 0).translate(bulb.x, bulb.y, bulb.z),
              BULB_COLOURS[index % BULB_COLOURS.length],
            ),
          ),
        ),
        ...LAMPS.map(([x, z]) =>
          paint(new IcosahedronGeometry(0.17, 0).translate(x, LAMP_GLASS.y, z), BULB_COLOURS[0]),
        ),
      ]),
      new MeshBasicMaterial({
        vertexColors: true,
        color: new Color(BULB_GLOW, BULB_GLOW, BULB_GLOW),
      }),
    );
    bulbs.name = 'bulbs';

    this.added.push(
      town,
      centrepiece,
      wires,
      bulbs,
      buildInstanced(
        cypress(1),
        leafy(8),
        CYPRESSES.map((spot, i) => at(spot, 0.9 + (i % 3) * 0.08, i)),
        {
          name: 'cypresses',
          castShadow: shadows,
          receiveShadow: shadows,
          tint: foliageTint,
        },
      ),
      buildInstanced(
        pottedOlive(2),
        leafy(3),
        POTS.map((spot, i) => at(spot, 1, i * 1.3)),
        {
          name: 'olives',
          castShadow: shadows,
          receiveShadow: shadows,
          tint: foliageTint,
        },
      ),
      buildInstanced(
        lampPost(),
        solid,
        LAMPS.map((spot) => at(spot)),
        { name: 'lamps', castShadow: shadows },
      ),
      buildInstanced(
        mast(),
        solid,
        MASTS.map((spot) => at(spot)),
        { name: 'masts', castShadow: shadows },
      ),
      buildInstanced(
        bench(),
        solid,
        BENCHES.map(([x, z, rotation]) => at([x, z], 1, rotation)),
        {
          name: 'benches',
          castShadow: shadows,
          receiveShadow: shadows,
        },
      ),
    );
    // Three sorts opaque meshes by material before distance, so the hills and the floor, whose
    // materials are older, drew first and the houses then painted over most of the hill rings'
    // shaded fragments. Drawn first, the town and its props reject those at the depth test: the
    // software renderer behind the low tier pays for every fragment it shades.
    this.added.forEach((object) => {
      object.renderOrder = OCCLUDERS_FIRST;
      ctx.scene.add(object);
    });
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.lowerPool.update();
    this.upperPool.update();
    this.jets.update();
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.backdrop?.dispose();
    this.backdrop = null;
    this.jets.dispose();
    this.upperPool.dispose();
    this.lowerPool.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.floor.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }
}

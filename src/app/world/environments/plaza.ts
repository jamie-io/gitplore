import {
  BufferGeometry,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
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
import { Backdrop } from './backdrop';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
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

const STUCCO = [0xe8c9a0, 0xf0dcc0, 0xe7b98f, 0xd9c4a8, 0xf2e6d0, 0xe3a98c] as const;
const SHUTTERS = [0x3f7f7a, 0x6b8f3f, 0x3f5f8f, 0x8f4f3f] as const;
const AWNINGS = [0x3f6f8f, 0xb8583a, 0x6b8f3f] as const;

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
  readonly spawn = new Vector3(0, 0, 26);
  readonly spawnYaw = 0;
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
    decorate: (material) =>
      void withAtmosphere(
        withTiles(material, {
          size: 1.1,
          grout: 0.035,
          groutColour: 0x9a9080,
          colours: [0xd9cdb5, 0xcfc1a6, 0xe2d7c1, 0xc9b99c],
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
        }),
        this.shared,
      ),
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
    colours: { shallow: 0x8fd0d8, deep: 0x2f7f9f, foam: 0xffffff },
  });
  private readonly upperPool = new Water({
    shared: this.shared,
    mood: PLAZA,
    centre: [0, 0],
    radius: FOUNTAIN.upper.radius,
    level: FOUNTAIN.upper.level,
    ground: basinFloor(FOUNTAIN.upper.level, FOUNTAIN.upper.radius, 0.25),
    colours: { shallow: 0x8fd0d8, deep: 0x3f8faf, foam: 0xffffff },
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
  private readonly backdrop = new Backdrop(
    [
      { radius: 140, depth: 70, height: 35, roughness: 0.4, color: 0x9aa07a, haze: 0.4, seed: 121 },
      {
        radius: 220,
        depth: 90,
        height: 55,
        roughness: 0.6,
        color: 0x8fa3b8,
        haze: 0.75,
        seed: 122,
      },
    ],
    PLAZA.fog.color,
  );
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

    const glowing = [
      ...strings.flatMap((string) =>
        string.bulbs.map((bulb) => ({
          x: bulb.x,
          y: bulb.y,
          z: bulb.z,
          scale: 1,
          rotation: 0,
          tint: 0,
        })),
      ),
      ...LAMPS.map(([x, z]) => ({ x, y: LAMP_GLASS.y, z, scale: 2.3, rotation: 0, tint: 0 })),
    ];
    const bulbs = buildInstanced(
      new IcosahedronGeometry(0.07, 0),
      new MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 3 }),
      glowing,
      { name: 'bulbs' },
    );

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
    this.added.forEach((object) => ctx.scene.add(object));
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
    this.backdrop.dispose();
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

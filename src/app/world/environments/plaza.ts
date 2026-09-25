import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import {
  FOUNTAIN,
  MAST_TOP,
  PLAZA_FOUNTAIN,
  STONE,
  bench,
  cypress,
  festoon,
  fountain,
  house,
  mast,
  pottedOlive,
} from './architecture';
import { Backdrop, HillRing } from './backdrop';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment, ToyLayout, ToyLine, ToySpot } from './environment';
import { assemble, paint } from './flora';
import { FountainJets } from './fountain-jets';
import { ProceduralGround } from './ground';
import { PLAZA, applyMood, clearMood } from './mood';
import {
  ARCH,
  ARCH_PIERS,
  BENCHES,
  CORNERS,
  CORNER_FOOTPRINTS,
  CYPRESSES,
  HOUSE_DEPTH,
  HouseSpot,
  MASTS,
  POTS,
  PlazaStation,
  RIDGE,
  SHUTTERS,
  SIZE,
  SPAWN,
  STATIONS,
  STREET_BLOCK,
  STUCCO,
  footprint,
  houseRow,
} from './plaza-layout';
import { seededRandom } from './random';
import { Placement, buildInstanced, foliageTint } from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { SharedUniforms } from './shaders/shared-uniforms';
import { withTiles } from './shaders/tiles';
import { withWind } from './shaders/wind';
import { Sky } from './sky';
import { Sun } from './sun';
import { Water } from './water';

/** Render order of everything that stands on the square, ahead of the floor, hills and sky. */
const OCCLUDERS_FIRST = -1;
/** Festoon bulbs: warm white, then amber, rose and turquoise; see `init`. */
const BULB_COLOURS = [0xffe2b0, 0xffa640, 0xff6f8a, 0x5fd8d0] as const;
/** Linear brightness of a bulb: over 1, so bloom catches it, but not a night-time glare. */
const BULB_GLOW = 2.6;
/** The near hills, seen over the roofs and through the street, and the far range over their crests. */
const HILLS: readonly HillRing[] = [
  { radius: 140, depth: 70, height: 35, roughness: 0.4, color: 0x8f9a6a, haze: 0.3, seed: 121 },
  { radius: 220, depth: 90, height: 55, roughness: 0.6, color: 0x8fa3b8, haze: 0.6, seed: 122 },
];
/** The mosaic ring's palette: blue, travertine, terracotta and sand. */
const RING_COLOURS = [0x3f6f8f, 0xd9cdb5, 0xb8583a, 0xe8c9a0] as const;
/** Corner blocks rise over the rows beside them, so they still close the corner above the roofs. */
const CORNER_HEIGHT = 10;
/** Height of the arch's piers, and of the lintel laid across them. */
const ARCH_HEIGHT = 5;
const LINTEL = 0.8;
/** Radius of a station medallion, and its lift off the floor. */
const MEDALLION = 0.9;
const MEDALLION_LIFT = 0.01;

const PLAZA_HOUSES: readonly HouseSpot[] = [
  ...houseRow('north', 81, false),
  ...houseRow('south', 82, true),
  ...houseRow('west', 83, false),
  ...houseRow('east', 84, false),
];

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
 * The fountain proxy: the shared fountain shrunk onto the Plaza's own kerb and water levels, so the
 * stone, its collider and the water planes agree until the fountain model replaces it.
 */
function plazaFountain(): BufferGeometry {
  const across = PLAZA_FOUNTAIN.radius / FOUNTAIN.radius;
  const up = PLAZA_FOUNTAIN.spout[1] / FOUNTAIN.spout[1];
  return fountain().scale(across, up, across);
}

/** The corner-block proxies: plain four-by-four town houses, ten metres high. */
function cornerBlocks(): BufferGeometry {
  const random = seededRandom(85);
  return merged(
    CORNERS.map((corner, index) => {
      // The block's centre is two metres from the pivot along both of its own axes.
      const [x, z] = [corner.x + Math.sign(corner.x) * 2, corner.z + Math.sign(corner.z) * 2];
      return placed(
        house(index + 1, {
          width: HOUSE_DEPTH,
          depth: HOUSE_DEPTH,
          height: CORNER_HEIGHT,
          stucco: STUCCO[Math.floor(random() * STUCCO.length)],
          shutters: SHUTTERS[Math.floor(random() * SHUTTERS.length)],
          flowers: false,
        }),
        x,
        z,
        // Its front turned to the fountain's side of the corner.
        corner.rotationY + Math.PI,
      );
    }),
  );
}

/** The arch proxy: two stone piers either side of the street and a lintel across them. */
function archGeometry(): BufferGeometry {
  return assemble([
    ...ARCH_PIERS.map((pier) =>
      paint(
        new BoxGeometry(pier.maxX - pier.minX, ARCH_HEIGHT, ARCH.depth).translate(
          (pier.minX + pier.maxX) / 2,
          ARCH_HEIGHT / 2,
          ARCH.z,
        ),
        STONE,
      ),
    ),
    paint(
      new BoxGeometry(ARCH.width, LINTEL, ARCH.depth).translate(
        ARCH.x,
        ARCH_HEIGHT - LINTEL / 2,
        ARCH.z,
      ),
      STONE,
    ),
  ]);
}

/** A mosaic disc on the floor at every glide stand: a blue rim, a sand field and a terracotta eye. */
function medallions(): BufferGeometry {
  return assemble(
    STATIONS.flatMap(({ stand }) =>
      [
        paint(new RingGeometry(MEDALLION * 0.67, MEDALLION, 24), RING_COLOURS[0]),
        paint(new RingGeometry(MEDALLION * 0.28, MEDALLION * 0.67, 24), RING_COLOURS[3]),
        paint(new CircleGeometry(MEDALLION * 0.28, 24), RING_COLOURS[2]),
      ].map((disc) => disc.rotateX(-Math.PI / 2).translate(stand.x, MEDALLION_LIFT, stand.z)),
    ),
  );
}

/**
 * A Mediterranean square at noon: a tiled floor with a mosaic ring, a two-tier fountain, pastel
 * houses closing three sides and an arched street on the fourth, four stations on the diagonals,
 * cypresses, benches and string lights, hills over the roofs.
 */
export class PlazaEnvironment implements Environment {
  readonly id = 'plaza' as const;
  readonly name = 'Plaza';
  /**
   * Where the return portal stands, in the arch of the south street. The visitor lands a few metres
   * in front of it, looking north across the fountain at the board and the ridge.
   */
  readonly spawn = new Vector3(SPAWN.x, 0, SPAWN.z);
  readonly spawnYaw = 0;
  /** The light and air of this place; the scene reads it to match whatever stands in it. */
  readonly mood = PLAZA;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(PLAZA);
  readonly colliders: readonly Collider[];

  private readonly houses = PLAZA_HOUSES;
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
          inner: 4.2,
          outer: 7,
          colours: [...RING_COLOURS],
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
    radius: PLAZA_FOUNTAIN.lower.radius,
    level: PLAZA_FOUNTAIN.lower.level,
    ground: basinFloor(PLAZA_FOUNTAIN.lower.level, PLAZA_FOUNTAIN.lower.radius, 0.5),
    colours: { shallow: 0x6cc2cf, deep: 0x1f6f95, foam: 0xffffff },
  });
  private readonly upperPool = new Water({
    shared: this.shared,
    mood: PLAZA,
    centre: [0, 0],
    radius: PLAZA_FOUNTAIN.upper.radius,
    level: PLAZA_FOUNTAIN.upper.level,
    ground: basinFloor(PLAZA_FOUNTAIN.upper.level, PLAZA_FOUNTAIN.upper.radius, 0.25),
    colours: { shallow: 0x6cc2cf, deep: 0x2f7fa5, foam: 0xffffff },
  });
  private readonly jets = new FountainJets({
    shared: this.shared,
    origin: [...PLAZA_FOUNTAIN.spout],
    jets: 8,
    reach: 2.1,
    height: 0.8,
    landing: PLAZA_FOUNTAIN.lower.level,
    colour: 0xe8f8ff,
  });
  private backdrop: Backdrop | null = null;
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {
    this.colliders = [
      { kind: 'cylinder', x: 0, z: 0, radius: PLAZA_FOUNTAIN.radius + 0.2 },
      ...this.houses.map(footprint),
      ...CORNER_FOOTPRINTS,
      ...ARCH_PIERS,
      STREET_BLOCK,
      ...CYPRESSES.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.5 })),
      ...POTS.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.6 })),
      ...MASTS.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 0.25 })),
      ...BENCHES.map(([x, z]) => ({ kind: 'cylinder' as const, x, z, radius: 1.0 })),
    ];
  }

  get ground() {
    return this.floor;
  }

  /** The project board: one exhibit, at the north-west station, facing the fountain. */
  anchors(count: number): readonly Anchor[] {
    const { prop } = STATIONS[1];
    return count > 0 ? [{ position: [prop.x, 0, prop.z], rotationY: prop.rotationY }] : [];
  }

  /**
   * The other three stations, and no seed lever: the terminal south-west, the commit ridge north-east with the release
   * cairns and star lanterns on its line, and the language row south-east along the circle.
   */
  toyLayout(): ToyLayout {
    const spot = (s: PlazaStation): ToySpot => ({
      position: new Vector3(s.prop.x, 0, s.prop.z),
      rotationY: s.prop.rotationY,
    });
    const ridge: ToyLine = {
      from: new Vector3(RIDGE.from.x, 0, RIDGE.from.z),
      to: new Vector3(RIDGE.to.x, 0, RIDGE.to.z),
    };
    return {
      terminal: spot(STATIONS[0]),
      ridge,
      languages: spot(STATIONS[3]),
      releases: ridge,
      stars: ridge,
    };
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

    const solidMesh = (geometry: BufferGeometry, name: string): Mesh => {
      const mesh = new Mesh(geometry, solid);
      mesh.name = name;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      return mesh;
    };
    // Each house at its final width: the stretch of the last one in a row is already in it.
    const town = solidMesh(
      merged(
        this.houses.map((spot) =>
          placed(house(spot.seed, spot.options), spot.x, spot.z, spot.rotationY),
        ),
      ),
      'houses',
    );
    const corners = solidMesh(cornerBlocks(), 'plaza-corners');
    const arch = solidMesh(archGeometry(), 'plaza-arch');
    const centrepiece = solidMesh(plazaFountain(), 'fountain');

    // Flat on the floor, pulled towards the camera in depth so the tiles never show through.
    const medallion = new Mesh(
      medallions(),
      withAtmosphere(
        new MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.6,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
        this.shared,
      ),
    );
    medallion.name = 'plaza-medallions';
    medallion.receiveShadow = shadows;

    // The four sides between the masts, then both diagonals across the fountain.
    const strings = MASTS.map(([x, z], index) => {
      const next = MASTS[(index + 1) % MASTS.length];
      return festoon(new Vector3(x, MAST_TOP, z), new Vector3(next[0], MAST_TOP, next[1]), 1.4, 18);
    }).concat(
      [0, 1].map((index) => {
        const [x, z] = MASTS[index];
        const [ox, oz] = MASTS[index + 2];
        return festoon(new Vector3(x, MAST_TOP, z), new Vector3(ox, MAST_TOP, oz), 0.8, 24);
      }),
    );
    const wires = new Mesh(merged(strings.map((string) => string.wire)), solid);
    wires.name = 'festoon-wires';

    // Every fourth string bulb is warm white and the others take a festival colour in turn, so
    // the strings still read as lights at noon, when a white bulb is lost against the sky.
    // Unlit and above 1 in linear, so the strongest tier blooms them a little; the medium and low
    // tiers draw them as flat, bright dots. One merged mesh rather than a hundred instances: the
    // software renderer behind the low tier paid about 3 ms a frame for the instanced draw of
    // these specks, and a single merged mesh costs next to none.
    // `assemble`, not a bare merge: it restores the normals `paint` strips, which the strongest
    // tier's ambient-occlusion pass reads; without them it blacked the bulbs out.
    const bulbs = new Mesh(
      assemble(
        strings.flatMap((string) =>
          string.bulbs.map((bulb, index) =>
            paint(
              new IcosahedronGeometry(0.08, 0).translate(bulb.x, bulb.y, bulb.z),
              BULB_COLOURS[index % BULB_COLOURS.length],
            ),
          ),
        ),
      ),
      new MeshBasicMaterial({
        vertexColors: true,
        color: new Color(BULB_GLOW, BULB_GLOW, BULB_GLOW),
      }),
    );
    bulbs.name = 'bulbs';

    this.added.push(
      town,
      corners,
      arch,
      centrepiece,
      medallion,
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

  /**
   * The seed lever. The square's only collider-free random decoration is the far hills: the houses
   * are one seeded stream that also places their footprints, and everything else stands at a fixed
   * spot, so all of that stays.
   */
  reseedDecoration(offset: number): void {
    this.backdrop?.reseed(offset);
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

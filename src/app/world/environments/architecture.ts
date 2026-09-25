import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { assemble, jitter, paint } from './flora';
import { between, seededRandom } from './random';

export interface HouseOptions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly stucco: number;
  readonly shutters: number;
  /** Awning stripe colour; no awning when absent. */
  readonly awning?: number;
  /** Bougainvillea over the door. */
  readonly flowers: boolean;
}

const TERRACOTTA = [0xb8583a, 0xa84f36, 0xc46a45] as const;
const GLASS = 0x2f3a45;
const DOOR = 0x5a3a28;
const IRON = 0x2a2d33;
/** Pale limestone: the fountain, the arch and the square's kerbs. */
export const STONE = 0xd9cdb5;
const STONE_DARK = 0xcfc1a6;

/**
 * A Mediterranean town house facing +Z: stucco walls, a terracotta hip roof overhanging 30 cm,
 * shuttered windows on every floor, one door, and optionally an awning and bougainvillea.
 * Base on y = 0, centred on its footprint.
 */
export function house(seed: number, options: HouseOptions): BufferGeometry {
  const random = seededRandom(seed);
  const { width, depth, height } = options;
  const front = depth / 2;
  const roofHeight = between(random, 1.6, 2.4);
  const roof = new ConeGeometry(Math.SQRT1_2, 1, 4)
    .rotateY(Math.PI / 4)
    .scale(width + 0.6, roofHeight, depth + 0.6)
    .translate(0, height + roofHeight / 2, 0);
  const parts: BufferGeometry[] = [
    paint(new BoxGeometry(width, height, depth).translate(0, height / 2, 0), options.stucco),
    paint(roof, TERRACOTTA[Math.floor(random() * TERRACOTTA.length)]),
  ];

  const columns = Math.max(1, Math.floor(width / 2.2));
  const spacing = width / columns;
  const doorColumn = Math.floor(random() * columns);
  const floors = Math.max(1, Math.floor(height / 3));
  for (let floor = 0; floor < floors; floor++) {
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + spacing * (column + 0.5);
      if (floor === 0 && column === doorColumn) {
        parts.push(paint(new BoxGeometry(1.2, 2.3, 0.14).translate(x, 1.15, front + 0.03), DOOR));
        continue;
      }
      // Panes rather than boxes: a window and its shutters were 108 vertices, 92 % of a house,
      // and the software renderer behind the low tier pays for every one. Their side faces were
      // a few centimetres deep and never read; 2 and 4 cm off the wall is far more than the depth
      // buffer resolves at the far side of the square, so nothing flickers.
      const y = 1.6 + floor * 3;
      parts.push(paint(new PlaneGeometry(0.9, 1.3).translate(x, y, front + 0.02), GLASS));
      for (const side of [-1, 1]) {
        parts.push(
          paint(
            new PlaneGeometry(0.45, 1.35).translate(x + side * 0.7, y, front + 0.04),
            options.shutters,
          ),
        );
      }
    }
  }

  if (options.awning !== undefined) {
    const stripes = 6;
    const span = width * 0.8;
    for (let i = 0; i < stripes; i++) {
      const stripe = new BoxGeometry(span / stripes, 0.05, 1.3)
        .rotateX(0.35)
        .translate(-span / 2 + (span / stripes) * (i + 0.5), 3.0, front + 0.6);
      parts.push(paint(stripe, i % 2 ? 0xf4f1e8 : options.awning));
    }
  }

  if (options.flowers) {
    const doorX = -width / 2 + spacing * (doorColumn + 0.5);
    for (let i = 0; i < 4; i++) {
      const bloom = jitter(
        new IcosahedronGeometry(between(random, 0.35, 0.55), 0),
        0.08,
        random,
      ).translate(doorX + between(random, -1.1, 1.1), between(random, 2.5, 3.3), front + 0.25);
      parts.push(paint(bloom, i % 2 ? 0xe8409a : 0xc92a78));
    }
  }

  return assemble(parts);
}

/** A slender Italian cypress, about 8 m. */
export function cypress(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const body = jitter(new IcosahedronGeometry(1, 1), 0.08, random)
    .scale(0.85, 3.6, 0.85)
    .translate(0, 4.1, 0);
  const tip = jitter(new IcosahedronGeometry(0.5, 0), 0.05, random)
    .scale(1, 2, 1)
    .translate(0, 7.3, 0);
  return assemble([
    paint(new CylinderGeometry(0.12, 0.16, 0.8, 5).translate(0, 0.4, 0), 0x5a4632),
    paint(body, 0x2f5a35),
    paint(tip, 0x376a3d),
  ]);
}

/** A silvery olive tree in a terracotta pot. */
export function pottedOlive(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const parts = [
    paint(new CylinderGeometry(0.45, 0.33, 0.7, 8).translate(0, 0.35, 0), TERRACOTTA[0]),
    paint(new CylinderGeometry(0.42, 0.42, 0.04, 8).translate(0, 0.69, 0), 0x4a3a2a),
    paint(new CylinderGeometry(0.06, 0.1, 1.3, 5).translate(0, 1.35, 0), 0x6b5a45),
  ];
  const crown: readonly (readonly [number, number, number, number])[] = [
    [0, 2.2, 0, 0.7],
    [0.45, 2.0, 0.2, 0.5],
    [-0.4, 2.1, -0.25, 0.55],
  ];
  for (const [x, y, z, radius] of crown) {
    parts.push(
      paint(
        jitter(new IcosahedronGeometry(radius, 0), radius * 0.15, random).translate(x, y, z),
        0x8f9f6a,
      ),
    );
  }
  return assemble(parts);
}

/** Where a lamp post's glass sits, relative to its foot: the glowing bulb goes here. */
export const LAMP_GLASS = new Vector3(0, 3.8, 0);

/** A cast-iron lamp post; its bulb is a separate emissive mesh at `LAMP_GLASS`. */
export function lampPost(): BufferGeometry {
  return assemble([
    paint(new CylinderGeometry(0.2, 0.24, 0.3, 8).translate(0, 0.15, 0), IRON),
    paint(new CylinderGeometry(0.06, 0.09, 3.5, 6).translate(0, 1.85, 0), IRON),
    paint(new BoxGeometry(0.36, 0.06, 0.36).translate(0, 3.55, 0), IRON),
    paint(new ConeGeometry(0.3, 0.3, 4).rotateY(Math.PI / 4).translate(0, 4.2, 0), IRON),
  ]);
}

/** A park bench facing +Z. */
export function bench(): BufferGeometry {
  return assemble([
    paint(new BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0), 0x8a6040),
    paint(new BoxGeometry(1.8, 0.4, 0.06).rotateX(-0.2).translate(0, 0.72, -0.24), 0x8a6040),
    ...[-0.75, 0.75].map((x) =>
      paint(new BoxGeometry(0.08, 0.45, 0.5).translate(x, 0.225, 0), IRON),
    ),
  ]);
}

/** Height at which festoon wires are tied to a mast. */
export const MAST_TOP = 6;

/** A slim iron mast that carries string lights. */
export function mast(): BufferGeometry {
  return assemble([
    paint(
      new CylinderGeometry(0.07, 0.12, MAST_TOP + 0.3, 6).translate(0, (MAST_TOP + 0.3) / 2, 0),
      IRON,
    ),
    paint(new ConeGeometry(0.12, 0.3, 6).translate(0, MAST_TOP + 0.45, 0), IRON),
  ]);
}

/** Water levels and radii of the fountain's two basins, where its jets rise, and its footprint. */
export const FOUNTAIN = {
  radius: 4.5,
  lower: { level: 0.58, radius: 3.85 },
  upper: { level: 2.52, radius: 1.25 },
  spout: [0, 3.62, 0],
} as const;

/**
 * The Plaza's own, smaller fountain: its kerb, the levels, radii and floors of its two basins, and
 * its spout, measured on the fountain model (scripts/blender/models/plaza_fountain.py). The water is
 * laid before the model arrives, so these must match it from the start. The collider is
 * `radius + 0.2`, which clears the plinth at 3.12 m.
 */
export const PLAZA_FOUNTAIN = {
  radius: 3,
  lower: { level: 0.46, radius: 2.6, floor: 0.06 },
  upper: { level: 2.03, radius: 0.9, floor: 1.86 },
  spout: [0, 3.0, 0],
} as const;

/** A two-tier stone fountain: a wide basin with a kerb, a pedestal, an upper bowl and a finial. */
export function fountain(): BufferGeometry {
  return assemble([
    paint(new CylinderGeometry(4.35, 4.5, 0.55, 28).translate(0, 0.275, 0), STONE),
    paint(
      new TorusGeometry(4.1, 0.3, 6, 28).rotateX(Math.PI / 2).translate(0, 0.62, 0),
      STONE_DARK,
    ),
    paint(new CylinderGeometry(0.45, 0.6, 1.5, 10).translate(0, 1.3, 0), STONE),
    paint(new CylinderGeometry(1.5, 0.5, 0.45, 16).translate(0, 2.275, 0), STONE),
    paint(
      new TorusGeometry(1.35, 0.14, 5, 16).rotateX(Math.PI / 2).translate(0, 2.5, 0),
      STONE_DARK,
    ),
    paint(new CylinderGeometry(0.12, 0.2, 0.9, 8).translate(0, 2.95, 0), STONE_DARK),
    paint(new IcosahedronGeometry(0.22, 0).translate(0, 3.45, 0), STONE_DARK),
  ]);
}

/** A string of lights hung between two points: its wire, and where each bulb hangs. */
export function festoon(
  from: Vector3,
  to: Vector3,
  sag: number,
  bulbs: number,
): { readonly wire: BufferGeometry; readonly bulbs: readonly Vector3[] } {
  // A parabola is indistinguishable from a catenary at this sag, and trivially exact to test.
  const at = (t: number) =>
    from
      .clone()
      .lerp(to, t)
      .setY(from.y + (to.y - from.y) * t - sag * 4 * t * (1 - t));
  const curve = new CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => at(i / 12)));

  return {
    wire: assemble([paint(new TubeGeometry(curve, 16, 0.015, 3, false), 0x222222)]),
    bulbs: Array.from({ length: bulbs }, (_, i) =>
      at((i + 0.5) / bulbs).add(new Vector3(0, -0.08, 0)),
    ),
  };
}

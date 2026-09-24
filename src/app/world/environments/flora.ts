import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random, between, seededRandom } from './random';

/**
 * Moves every vertex by up to `amount` metres on each axis. Vertices that coincide move together
 * (keyed by position), so faces of Three's primitives — which duplicate corners — stay closed.
 */
export function jitter(geometry: BufferGeometry, amount: number, random: Random): BufferGeometry {
  const position = geometry.getAttribute('position');
  const offsets = new Map<string, readonly [number, number, number]>();

  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
    let offset = offsets.get(key);
    if (!offset) {
      offset = [
        between(random, -amount, amount),
        between(random, -amount, amount),
        between(random, -amount, amount),
      ];
      offsets.set(key, offset);
    }
    position.setXYZ(
      i,
      position.getX(i) + offset[0],
      position.getY(i) + offset[1],
      position.getZ(i) + offset[2],
    );
  }

  position.needsUpdate = true;
  return geometry;
}

/** A flat-coloured, non-indexed, uv-free copy ready to merge: every part of a prop looks like this. */
export function paint(geometry: BufferGeometry, color: number | Color): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  flat.deleteAttribute('normal');

  const colour = new Color(color);
  const colours = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colours.length; i += 3) {
    colours[i] = colour.r;
    colours[i + 1] = colour.g;
    colours[i + 2] = colour.b;
  }
  flat.setAttribute('color', new BufferAttribute(colours, 3));
  return flat;
}

/** Merges painted parts into one faceted geometry with one normal per face. */
export function assemble(parts: readonly BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries([...parts], false);
  if (!merged) {
    throw new Error('flora parts do not share the same attributes');
  }
  parts.forEach((part) => part.dispose());
  // Non-indexed, so each triangle gets its own normal: the faceted low-poly look without the
  // `flatShading` derivative trick that misbehaves under SwiftShader (HANDOFF §5.6).
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const BARK = 0x6b4a33;
const BIRCH_BARK = 0xe8e2d4;
const BIRCH_MARK = 0x3a3530;
const STEM = 0x6f9a44;

/** A round-crowned deciduous tree, about 5–6 m tall: the meadow's groves. */
export function broadleafTree(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const height = between(random, 2.5, 3.1);
  const parts = [
    paint(
      jitter(new CylinderGeometry(0.16, 0.3, height, 6).translate(0, height / 2, 0), 0.04, random),
      BARK,
    ),
  ];
  const crown: readonly (readonly [number, number, number, number, number])[] = [
    [0, 1.25, 0, 1.6, 0x5e8c3a],
    [0.95, 0.85, 0.3, 1.1, 0x6f9e43],
    [-0.8, 0.95, -0.45, 1.2, 0x557f35],
    [0.25, 1.95, -0.2, 1.0, 0x7aa84a],
  ];
  for (const [x, y, z, radius, colour] of crown) {
    const blob = new IcosahedronGeometry(radius * between(random, 0.9, 1.1), 0);
    parts.push(paint(jitter(blob, radius * 0.14, random).translate(x, height + y, z), colour));
  }
  return assemble(parts);
}

/** A slim white-barked birch with an upright, airy crown. */
export function birchTree(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const height = between(random, 3.6, 4.4);
  const parts = [
    paint(
      jitter(new CylinderGeometry(0.1, 0.15, height, 6).translate(0, height / 2, 0), 0.02, random),
      BIRCH_BARK,
    ),
  ];
  for (const fraction of [0.25, 0.5, 0.7]) {
    const radius = 0.15 - 0.05 * fraction + 0.01;
    parts.push(
      paint(
        new CylinderGeometry(radius, radius, 0.07, 6).translate(0, height * fraction, 0),
        BIRCH_MARK,
      ),
    );
  }
  const crown: readonly (readonly [number, number, number])[] = [
    [0.5, 0.85, 0x9fbf4a],
    [1.4, 0.7, 0x8cb043],
  ];
  for (const [lift, radius, colour] of crown) {
    const blob = jitter(new IcosahedronGeometry(radius, 0), radius * 0.14, random).scale(1, 1.5, 1);
    parts.push(paint(blob.translate(0, height + lift, 0), colour));
  }
  return assemble(parts);
}

/** A three-tiered conifer for the far hills. */
export function pineTree(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const parts = [paint(new CylinderGeometry(0.14, 0.22, 1.4, 5).translate(0, 0.7, 0), BARK)];
  const tiers: readonly (readonly [number, number, number, number])[] = [
    [1.6, 2.4, 2.0, 0x2f5d3a],
    [1.2, 2.0, 3.3, 0x376a42],
    [0.8, 1.7, 4.4, 0x3f7549],
  ];
  for (const [radius, height, centre, colour] of tiers) {
    const cone = new ConeGeometry(radius * between(random, 0.92, 1.08), height, 7);
    parts.push(paint(jitter(cone, 0.08, random).translate(0, centre, 0), colour));
  }
  return assemble(parts);
}

/** A knee-high clump of three leafy blobs. */
export function bush(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const blobs: readonly (readonly [number, number, number, number, number])[] = [
    [0, 0.45, 0, 0.7, 0x4f7d34],
    [0.5, 0.35, 0.2, 0.5, 0x5d8f3b],
    [-0.4, 0.4, -0.25, 0.55, 0x46722f],
  ];
  return assemble(
    blobs.map(([x, y, z, radius, colour]) =>
      paint(
        jitter(new IcosahedronGeometry(radius, 0), radius * 0.18, random).translate(x, y, z),
        colour,
      ),
    ),
  );
}

/** A weathered stone, half sunk into the ground. */
export function boulder(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const rock = jitter(new DodecahedronGeometry(1, 0), 0.22, random)
    .scale(1.3, 0.75, 1.1)
    .translate(0, 0.3, 0);
  return assemble([paint(rock, 0x8b8578)]);
}

/** Three stems with a blossom each; one geometry per blossom colour keeps the stems green. */
export function flowerTuft(seed: number, blossom: number): BufferGeometry {
  const random = seededRandom(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + random();
    const x = Math.sin(angle) * 0.08;
    const z = Math.cos(angle) * 0.08;
    const height = between(random, 0.28, 0.45);
    // Stems thick and light enough not to read as black sticks 20 m off, and blossoms big enough
    // to still be a dot of colour there.
    parts.push(paint(new BoxGeometry(0.026, height, 0.026).translate(x, height / 2, z), STEM));
    parts.push(
      paint(new OctahedronGeometry(0.075, 0).scale(1, 0.55, 1).translate(x, height, z), blossom),
    );
    parts.push(paint(new OctahedronGeometry(0.025, 0).translate(x, height + 0.035, z), 0xf2c94c));
  }
  return assemble(parts);
}

/** Leaning blades and a few bulrushes for the pond's edge. */
export function reeds(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const height = between(random, 1.0, 1.7);
    const blade = new ConeGeometry(0.035, height, 3).translate(0, height / 2, 0);
    blade.rotateZ(between(random, -0.18, 0.18));
    blade.rotateX(between(random, -0.18, 0.18));
    blade.translate(between(random, -0.25, 0.25), 0, between(random, -0.25, 0.25));
    parts.push(paint(blade, i % 2 ? 0x7d8f4a : 0x6f8a3f));
  }
  for (let i = 0; i < 3; i++) {
    const height = between(random, 1.2, 1.8);
    const x = between(random, -0.2, 0.2);
    const z = between(random, -0.2, 0.2);
    parts.push(
      paint(new CylinderGeometry(0.012, 0.015, height, 4).translate(x, height / 2, z), 0x7d8f4a),
    );
    parts.push(
      paint(new CylinderGeometry(0.045, 0.045, 0.24, 5).translate(x, height - 0.1, z), 0x6b4a2f),
    );
  }
  return assemble(parts);
}

/** A notched lily pad, sometimes with a flower. Its origin is the water surface. */
export function lilyPad(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const notch = random() * Math.PI * 2;
  const parts = [
    paint(
      new CylinderGeometry(0.35, 0.35, 0.02, 9, 1, false, notch + 0.3, Math.PI * 2 - 0.6).translate(
        0,
        0.01,
        0,
      ),
      0x4f8a3c,
    ),
  ];
  if (random() < 0.35) {
    parts.push(paint(new OctahedronGeometry(0.06, 0).translate(0.08, 0.06, 0.04), 0xf0a8c8));
  }
  return assemble(parts);
}

/** A leaf blade: a flattened cone lying along +X from the origin, tilted by `pitch` (up is positive). */
function blade(length: number, width: number, pitch: number, yaw: number): BufferGeometry {
  return new ConeGeometry(width, length, 4)
    .scale(0.15, 1, 1)
    .translate(0, length / 2, 0)
    .rotateZ(-(Math.PI / 2 - pitch))
    .rotateY(yaw);
}

/** A rainforest giant: buttressed trunk and an umbrella canopy high overhead, about 15–17 m. */
export function kapokTree(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const height = between(random, 12, 14);
  const parts = [
    paint(
      jitter(new CylinderGeometry(0.45, 0.8, height, 7).translate(0, height / 2, 0), 0.06, random),
      0x6e5a45,
    ),
  ];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + random() * 0.4;
    const fin = new ConeGeometry(1.2, 2.6, 4)
      .scale(0.12, 1, 1)
      .translate(0, 1.3, 0.9)
      .rotateY(angle);
    parts.push(paint(fin, 0x655241));
  }
  const canopy: readonly (readonly [number, number, number, number, number])[] = [
    [0, 0.6, 0, 4.2, 0x2f6b3a],
    [2.4, 0.2, 1.2, 3.4, 0x3d7d45],
    [-2.2, 0.4, -1.6, 3.0, 0x2a5f35],
    [0.6, 1.4, -0.4, 2.6, 0x4f8f4a],
  ];
  for (const [x, y, z, radius, colour] of canopy) {
    const blob = jitter(new IcosahedronGeometry(radius, 1), radius * 0.1, random).scale(1, 0.38, 1);
    parts.push(paint(blob.translate(x, height + y, z), colour));
  }
  return assemble(parts);
}

/** A leaning palm: six trunk segments bending one way, a crown of drooping fronds, coconuts. */
export function palmTree(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const bend = between(random, 0.04, 0.1);
  const parts: BufferGeometry[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const tilt = bend * i;
    const radius = 0.22 - i * 0.015;
    const segment = new CylinderGeometry(radius - 0.015, radius, 1.2, 6)
      .translate(0, 0.6, 0)
      .rotateZ(-tilt)
      .translate(x, y, 0);
    parts.push(paint(segment, i % 2 ? 0x8a7355 : 0x7a6449));
    x += 1.2 * Math.sin(tilt);
    y += 1.2 * Math.cos(tilt);
  }
  for (let i = 0; i < 8; i++) {
    const frond = blade(
      3.2,
      0.35,
      -between(random, 0.2, 0.45),
      (i / 8) * Math.PI * 2 + random() * 0.3,
    );
    parts.push(paint(frond.translate(x, y, 0), i % 2 ? 0x4f8f3a : 0x5c9c42));
  }
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    parts.push(
      paint(
        new IcosahedronGeometry(0.16, 0).translate(
          x + Math.sin(angle) * 0.25,
          y - 0.25,
          Math.cos(angle) * 0.25,
        ),
        0x5a4a2a,
      ),
    );
  }
  return assemble(parts);
}

/** A tree fern: a short shaggy trunk and a rosette of arching fronds. */
export function treeFern(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const height = between(random, 2, 2.8);
  const parts = [
    paint(
      jitter(new CylinderGeometry(0.16, 0.24, height, 6).translate(0, height / 2, 0), 0.03, random),
      0x5a4632,
    ),
  ];
  for (let i = 0; i < 9; i++) {
    const frond = blade(2.2, 0.3, 0.5 - random() * 0.2, (i / 9) * Math.PI * 2 + random() * 0.3);
    parts.push(paint(frond.translate(0, height, 0), i % 2 ? 0x3f7f3a : 0x4c8f44));
  }
  return assemble(parts);
}

/** Leaves in one cluster, spread evenly around the root. */
const CLUSTER_LEAVES = 7;
/** One leaf's width and length, metres at scale 1. */
const LEAF_WIDTH = 0.34;
const LEAF_LENGTH = 1.25;

/**
 * Seven long leaves arching out of one root: the jungle's instanced undergrowth and, hung upside
 * down, its canopy. Unlike the props above it is smooth-shaded and uncoloured: indexed, with one
 * normal per corner so light rolls across each curved blade, and tinted per instance. It is the
 * same every time; the variety comes from each instance's scale, tilt and colour.
 */
export function leafCluster(): BufferGeometry {
  const leaves: BufferGeometry[] = [];
  for (let i = 0; i < CLUSTER_LEAVES; i++) {
    const leaf = new PlaneGeometry(LEAF_WIDTH, LEAF_LENGTH, 2, 8);
    leaf.deleteAttribute('uv');
    const position = leaf.getAttribute('position');
    for (let k = 0; k < position.count; k++) {
      // From the root (t = 0) to the tip (t = 1): widest a little past the middle, pointed at both
      // ends, curling forwards along its length and cupped across it.
      const y = position.getY(k) + LEAF_LENGTH / 2;
      const t = y / LEAF_LENGTH;
      const x = position.getX(k) * Math.sin(Math.PI * Math.min(t * 1.1, 1)) * (1 - t * 0.2);
      position.setXYZ(k, x, y, t * t * 0.45 - Math.abs(x) * 0.35);
    }
    leaf.rotateX(-0.55 - (i % 3) * 0.18);
    leaf.rotateY((i / CLUSTER_LEAVES) * Math.PI * 2 + (i % 2) * 0.3);
    leaves.push(leaf);
  }

  const cluster = mergeGeometries(leaves, false);
  if (!cluster) {
    throw new Error('leaf parts do not share the same attributes');
  }
  leaves.forEach((leaf) => leaf.dispose());
  cluster.computeVertexNormals();
  cluster.computeBoundingBox();
  cluster.computeBoundingSphere();
  return cluster;
}

/** A boulder with a cushion of moss on top. */
export function mossyBoulder(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const rock = jitter(new DodecahedronGeometry(1, 0), 0.22, random)
    .scale(1.3, 0.75, 1.1)
    .translate(0, 0.3, 0);
  const moss = jitter(new IcosahedronGeometry(1, 0), 0.08, random)
    .scale(1.15, 0.32, 0.95)
    .translate(0, 0.8, 0);
  return assemble([paint(rock, 0x6f6a5f), paint(moss, 0x4f7f3a)]);
}

/** A vine hanging from its origin — the point where it is tied to a branch — 4 to 7 m down. */
export function liana(seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const parts: BufferGeometry[] = [];
  const segments = 4;
  const length = between(random, 1.1, 1.7);
  let x = 0;
  let z = 0;
  for (let i = 0; i < segments; i++) {
    const dx = between(random, -0.25, 0.25);
    const dz = between(random, -0.25, 0.25);
    const top = -i * length;
    const segment = new CylinderGeometry(0.035, 0.035, length, 4)
      .translate(0, -length / 2, 0)
      .rotateZ(Math.atan2(dx, length))
      .rotateX(-Math.atan2(dz, length))
      .translate(x, top, z);
    parts.push(paint(segment, 0x5a4a32));
    x += dx;
    z += dz;
    parts.push(
      paint(new OctahedronGeometry(0.14, 0).translate(x, top - length * 0.6, z), 0x3b6b2f),
    );
  }
  return assemble(parts);
}

/** Fraction of a cliff's height where the lip of its waterfall notch sits. */
export const CLIFF_LIP = 0.85;

/**
 * A rock face `width` metres wide and up to `height` tall, facing +Z, with its foot sunk 2 m into the
 * ground and a lower notch where a waterfall pours over. Its origin is the foot of the face, centred.
 */
export function cliffWall(
  seed: number,
  width: number,
  height: number,
  notch: { readonly x: number; readonly width: number },
  opening?: CliffOpening,
): BufferGeometry {
  const random = seededRandom(seed);
  const rocks = [0x6f6a5f, 0x7d776a, 0x5f5a50] as const;
  const columns = Math.max(1, Math.round(width / 3));
  const step = width / columns;
  const parts: BufferGeometry[] = [];

  for (let i = 0; i < columns; i++) {
    const x = -width / 2 + step * (i + 0.5);
    const inNotch = Math.abs(x - notch.x) < notch.width / 2;
    const top = inNotch ? height * CLIFF_LIP : height * between(random, 0.75, 1);
    const depth = between(random, 3.5, 5);
    const setBack = between(random, 0, 1.2);
    const column = new BoxGeometry(step * 1.15, top + 2, depth).translate(x, top / 2 - 1, -setBack);
    // Jitter even a column the opening replaces, so every later column draws the same numbers.
    const rock = jitter(column, 0.35, random);
    const around = opening && openingPieces(x, step * 1.15, top, depth, setBack, opening);
    if (around) {
      rock.dispose();
      parts.push(...around.map((piece) => paint(piece, rocks[i % rocks.length])));
    } else {
      parts.push(paint(rock, rocks[i % rocks.length]));
    }
    if (!inNotch) {
      const moss = jitter(new IcosahedronGeometry(step * 0.6, 0), 0.15, random).scale(1, 0.3, 0.9);
      parts.push(paint(moss.translate(x, top + 0.1, -setBack), 0x3f6f35));
    }
  }
  return assemble(parts);
}

/**
 * A walk-in mouth at the foot of a cliff, in the cliff's own frame: `x` is its centre, `width` its
 * outer width, `height` how far above the cliff's origin its roof reaches and `back` the Z where the
 * rock behind it resumes.
 */
export interface CliffOpening {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly back: number;
}

/**
 * The rock of one column around an opening: a block above it, the parts either side and the rock
 * behind it. Unjittered, so no stray vertex pokes into the mouth. `null` when the column misses it.
 */
function openingPieces(
  x: number,
  columnWidth: number,
  top: number,
  depth: number,
  setBack: number,
  opening: CliffOpening,
): BufferGeometry[] | null {
  const minX = x - columnWidth / 2;
  const maxX = x + columnWidth / 2;
  const openMinX = opening.x - opening.width / 2;
  const openMaxX = opening.x + opening.width / 2;
  if (maxX <= openMinX || minX >= openMaxX) {
    return null;
  }

  const back = -setBack - depth / 2;
  const front = -setBack + depth / 2;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
    );
  const pieces = [box(minX, maxX, opening.height, top, back, front)];
  if (minX < openMinX) {
    pieces.push(box(minX, openMinX, -2, opening.height, back, front));
  }
  if (maxX > openMaxX) {
    pieces.push(box(openMaxX, maxX, -2, opening.height, back, front));
  }
  if (back < opening.back) {
    const behind = Math.min(opening.back, front);
    pieces.push(
      box(Math.max(minX, openMinX), Math.min(maxX, openMaxX), -2, opening.height, back, behind),
    );
  }
  return pieces;
}

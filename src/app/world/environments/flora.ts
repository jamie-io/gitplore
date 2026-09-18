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
const STEM = 0x5f8a3a;

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
    parts.push(paint(new BoxGeometry(0.018, height, 0.018).translate(x, height / 2, z), STEM));
    parts.push(
      paint(new OctahedronGeometry(0.055, 0).scale(1, 0.55, 1).translate(x, height, z), blossom),
    );
    parts.push(paint(new OctahedronGeometry(0.02, 0).translate(x, height + 0.03, z), 0xf2c94c));
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

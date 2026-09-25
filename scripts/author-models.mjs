/**
 * Builds the glTF models (IMPLEMENTATION_PLAN.md §8 conventions: +Y up, metres, origin at the
 * ground centre, one material per part, transforms applied); `npm run assets:optimize` then
 * compresses the output like any authored file.
 *
 * The hub's monument and portal arch are built here in code. The Deslopify jungle's props (its
 * bridge arch, lantern, stele and feed-card frame) are modelled in Blender by the scripts in
 * scripts/blender, run headless; set BLENDER to the binary if it is not on the PATH. Without
 * Blender those sources are left as committed.
 *
 * Output: assets-src/models/<name>.glb — the uncompressed sources that are committed.
 */
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const OUT_DIR = fileURLToPath(new URL('../assets-src/models/', import.meta.url));

/** Axis-aligned box centred at (cx, cy, cz). Returns flat positions, normals and indices. */
function box(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    {
      n: [0, 0, 1],
      corners: [
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
        [-hx, hy, -hz],
        [hx, hy, -hz],
      ],
    },
    {
      n: [1, 0, 0],
      corners: [
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [hx, hy, hz],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [-hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, hy, hz],
        [-hx, hy, -hz],
      ],
    },
    {
      n: [0, 1, 0],
      corners: [
        [-hx, hy, hz],
        [hx, hy, hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, -hy, hz],
        [-hx, -hy, hz],
      ],
    },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((face, f) => {
    face.corners.forEach(([x, y, z]) => {
      positions.push(x + cx, y + cy, z + cz);
      normals.push(...face.n);
    });
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, indices };
}

/** Tapered prism (pyramid frustum) with `sides` sides, base radius r0 at y0, top radius r1 at y1. */
function frustum(sides, r0, r1, y0, y1, cx = 0, cz = 0) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const quad = [
      [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0],
      [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0],
      [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1],
      [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1],
    ];
    const mid = (a0 + a1) / 2;
    const slope = (r0 - r1) / (y1 - y0);
    const len = Math.hypot(1, slope);
    const n = [Math.cos(mid) / len, slope / len, Math.sin(mid) / len];
    const o = positions.length / 3;
    quad.forEach((p) => {
      positions.push(...p);
      normals.push(...n);
    });
    indices.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  // Top cap.
  const capStart = positions.length / 3;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    positions.push(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1);
    normals.push(0, 1, 0);
  }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(capStart, capStart + i + 1, capStart + i);
  }
  return { positions, normals, indices };
}

function merge(...parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    normals.push(...part.normals);
    indices.push(...part.indices.map((i) => i + offset));
  }
  return { positions, normals, indices };
}

function addPart(doc, buffer, scene, name, geometry, color, options = {}) {
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(geometry.positions))
    .setBuffer(buffer);
  const normal = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(geometry.normals))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array(geometry.indices))
    .setBuffer(buffer);
  const material = doc
    .createMaterial(`${name}-material`)
    .setBaseColorFactor([...color, 1])
    .setRoughnessFactor(options.roughness ?? 0.85)
    .setMetallicFactor(0);
  if (options.emissive) {
    material.setEmissiveFactor(options.emissive);
  }
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(indices)
    .setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(primitive);
  const node = doc.createNode(name).setMesh(mesh);
  scene.addChild(node);
}

function monument() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('monument');
  doc.getRoot().setDefaultScene(scene);

  // Three stacked stone tiers, an obelisk, and a glowing cap: the hub's landmark at the centre.
  addPart(
    doc,
    buffer,
    scene,
    'plinth',
    merge(
      frustum(8, 3.2, 3.0, 0, 0.5),
      frustum(8, 2.4, 2.2, 0.5, 1.0),
      frustum(8, 1.6, 1.4, 1.0, 1.5),
    ),
    [0.55, 0.56, 0.6],
  );
  addPart(doc, buffer, scene, 'obelisk', frustum(4, 0.7, 0.35, 1.5, 7.5), [0.42, 0.44, 0.5]);
  addPart(doc, buffer, scene, 'cap', frustum(4, 0.4, 0.02, 7.5, 8.6), [0.95, 0.85, 0.5], {
    emissive: [0.9, 0.7, 0.2],
    roughness: 0.4,
  });
  return doc;
}

function arch() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('arch');
  doc.getRoot().setDefaultScene(scene);

  // Same footprint as the procedural portal (pillars at ±1.4 m, 3.6 m high), just nicer.
  const stone = [0.5, 0.52, 0.58];
  addPart(
    doc,
    buffer,
    scene,
    'pillars',
    merge(
      frustum(8, 0.45, 0.32, 0, 3.6, -1.4, 0),
      frustum(8, 0.45, 0.32, 0, 3.6, 1.4, 0),
      box(-1.4, 0.15, 0, 1.1, 0.3, 1.1),
      box(1.4, 0.15, 0, 1.1, 0.3, 1.1),
    ),
    stone,
  );
  addPart(
    doc,
    buffer,
    scene,
    'lintel',
    merge(
      box(0, 3.85, 0, 3.9, 0.5, 0.9),
      box(0, 4.25, 0, 3.2, 0.3, 0.7),
      box(0, 4.6, 0, 0.6, 0.4, 0.6),
    ),
    [0.44, 0.46, 0.52],
  );
  return doc;
}

await mkdir(OUT_DIR, { recursive: true });
const io = new NodeIO();
for (const [name, build] of [
  ['monument', monument],
  ['arch', arch],
]) {
  const doc = build();
  const glb = await io.writeBinary(doc);
  const path = `${OUT_DIR}${name}.glb`;
  await (await import('node:fs/promises')).writeFile(path, glb);
  console.log(`✓ ${name}.glb  ${glb.byteLength} bytes`);
}

const BLENDER = process.env['BLENDER'] ?? 'blender';
const AUTHOR = fileURLToPath(new URL('./blender/author.py', import.meta.url));
let output = null;
try {
  output = execFileSync(
    BLENDER,
    ['-b', '--factory-startup', '--python-exit-code', '1', '--python', AUTHOR, '--', OUT_DIR],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
  );
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
  console.warn(`! ${BLENDER} not found: the Blender-authored sources stay as committed`);
}
if (output !== null) {
  const line = output.split('\n').find((l) => l.startsWith('AUTHORED '));
  if (!line) {
    throw new Error('Blender finished without reporting the models it authored');
  }
  const report = JSON.parse(line.slice('AUTHORED '.length));
  for (const [name, { triangles, bytes }] of Object.entries(report)) {
    console.log(`✓ ${name}.glb  ${bytes} bytes  ${triangles} triangles  (Blender)`);
  }
}

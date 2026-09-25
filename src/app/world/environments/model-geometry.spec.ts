import { readFileSync } from 'node:fs';
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { adoptNode, bakeGeometry } from './model-geometry';

function optimizedGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new InterleavedBuffer(
    new Int16Array([0, 0, 0, 0, 16384, 0, 0, 0, 0, -16384, 16384, 0]),
    4,
  );
  const normals = new InterleavedBuffer(
    new Int8Array([127, 0, 0, 0, 0, 127, 0, 0, 0, 0, 127, 0]),
    4,
  );
  geometry.setAttribute('position', new InterleavedBufferAttribute(positions, 3, 0, true));
  geometry.setAttribute('normal', new InterleavedBufferAttribute(normals, 3, 0, true));
  geometry.setAttribute(
    'color',
    new BufferAttribute(new Uint8Array([255, 128, 0, 0, 255, 128, 32, 64, 255]), 3, true),
  );
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return geometry;
}

function modelRoot(node: Mesh | Group): Group {
  const root = new Group();
  root.position.set(10, 20, 30);
  root.add(node);
  return root;
}

async function loadModel(path: string): Promise<Group> {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(path);
  const arrayBuffer = new Uint8Array(bytes.byteLength);
  arrayBuffer.set(bytes);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer.buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

describe('model geometry', () => {
  it('unpacks quantized attributes, applies node transform, and keeps source geometry unchanged', () => {
    const source = optimizedGeometry();
    const position = source.getAttribute('position');
    const normal = source.getAttribute('normal');
    const color = source.getAttribute('color');
    const index = source.getIndex();
    const sourcePosition = Array.from(position.array);
    const sourceNormal = Array.from(normal.array);
    const sourceColor = Array.from(color.array);
    const node = new Mesh(source, new MeshStandardMaterial());
    node.position.set(2, 3, 4);
    node.scale.set(2, 3, 4);
    modelRoot(node);

    const baked = bakeGeometry(node);

    expect(baked).toBeInstanceOf(BufferGeometry);
    expect(baked?.getAttribute('position').array).toBeInstanceOf(Float32Array);
    expect(baked?.getAttribute('normal').array).toBeInstanceOf(Float32Array);
    expect(baked?.getAttribute('color').array).toBeInstanceOf(Float32Array);
    expect(baked?.getAttribute('position').itemSize).toBe(3);
    expect(baked?.getAttribute('normal').itemSize).toBe(3);
    expect(baked?.getAttribute('color').itemSize).toBe(3);

    const positions = baked!.getAttribute('position');
    expect(positions.getX(0)).toBeCloseTo(2, 4);
    expect(positions.getX(1)).toBeCloseTo(3, 4);
    expect(positions.getY(2)).toBeCloseTo(1.5, 4);
    expect(positions.getZ(2)).toBeCloseTo(6, 3);
    expect(Array.from(baked!.getIndex()!.array)).toEqual([0, 1, 2]);
    expect(Array.from(source.getAttribute('position').array)).toEqual(sourcePosition);
    expect(Array.from(source.getAttribute('normal').array)).toEqual(sourceNormal);
    expect(Array.from(source.getAttribute('color').array)).toEqual(sourceColor);
    expect(source.getIndex()).toBe(index);
  });

  it('finds a mesh one level below the model node and applies its relative transform', () => {
    const node = new Group();
    node.position.set(1, 2, 3);
    node.scale.setScalar(2);
    const mesh = new Mesh(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([1, 0, 0], 3)),
      new MeshStandardMaterial(),
    );
    mesh.position.set(0.5, 0, 0);
    node.add(mesh);
    modelRoot(node);

    const baked = bakeGeometry(node);

    expect(baked?.getAttribute('position').getX(0)).toBeCloseTo(4, 6);
    expect(baked?.getAttribute('position').getY(0)).toBeCloseTo(2, 6);
    expect(baked?.getAttribute('position').getZ(0)).toBeCloseTo(3, 6);
  });

  it('returns null when node contains no mesh', () => {
    expect(bakeGeometry(new Group())).toBeNull();
  });

  it('adopts authored placement without changing node scale', () => {
    const node = new Group();
    node.position.set(-0.32, 1.7, 0.05);
    node.scale.set(2, 3, 4);
    const authoredAt = new Vector3(-0.42, 1.5, 0);

    expect(adoptNode(node, authoredAt)).toBe(node);
    expect(node.position.x).toBeCloseTo(0.1, 6);
    expect(node.position.y).toBeCloseTo(0.2, 6);
    expect(node.position.z).toBeCloseTo(0.05, 6);
    expect(node.scale.toArray()).toEqual([2, 3, 4]);
  });

  it('bakes optimized jungle rock nodes into their authored envelope', async () => {
    const scene = await loadModel('public/assets/models/jungle-rocks.glb');

    for (const name of ['boulder-0', 'boulder-1']) {
      const node = scene.getObjectByName(name);
      expect(node).toBeDefined();
      const baked = bakeGeometry(node!);
      expect(baked).toBeDefined();
      baked!.computeBoundingBox();
      const bounds = baked!.boundingBox!;
      expect(bounds.max.x - bounds.min.x).toBeGreaterThan(2.4);
      expect(bounds.max.x - bounds.min.x).toBeLessThan(3.2);
      expect(bounds.max.y).toBeGreaterThan(0.9);
      expect(bounds.max.y).toBeLessThan(1.4);
      expect(bounds.min.y).toBeLessThan(0);
      baked!.dispose();
    }
  });
});

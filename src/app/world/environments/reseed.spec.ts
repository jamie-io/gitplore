import { BufferGeometry, InstancedMesh, Material, Mesh, Object3D, Points, Scene } from 'three';
import { forEachResource } from '@engine/dispose';
import { stubContext } from '@engine/testing/world-context';
import type { Environment } from './environment';
import { JungleEnvironment } from './jungle';
import { PlazaEnvironment } from './plaza';
import { ShowroomEnvironment } from './showroom';

/**
 * The seed lever's contract with every environment a project world can use: a reseed moves
 * collider-free decoration and nothing else, keeps every material (so no shader compiles), releases
 * whatever geometry it replaces, and is a pure function of the offset.
 */
const CASES: readonly [string, () => Environment, RegExp][] = [
  // The undergrowth, the spores and fireflies, and the far hills.
  [
    'Dschungel',
    () => new JungleEnvironment({ reducedMotion: () => true }),
    /^(big-leaf|fern)-|^motes$|^backdrop$/,
  ],
  ['Plaza', () => new PlazaEnvironment({ reducedMotion: () => true }), /^backdrop$/],
  ['Showroom', () => new ShowroomEnvironment({ reducedMotion: () => true }), /^motes$/],
];

/** Every drawable's name with its positions: instance matrices for instanced meshes, vertices otherwise. */
function layout(scene: Scene): Map<string, string> {
  const entries = new Map<string, string>();
  const seen = new Map<string, number>();
  scene.traverse((object: Object3D) => {
    if (!(object instanceof Mesh) && !(object instanceof Points)) {
      return;
    }
    const data =
      object instanceof InstancedMesh
        ? object.instanceMatrix.array
        : (object.geometry as BufferGeometry).getAttribute('position').array;
    // Keyed by name and occurrence, not by traversal order: a reseeded mesh rejoins its parent last.
    const occurrence = seen.get(object.name) ?? 0;
    seen.set(object.name, occurrence + 1);
    entries.set(`${object.name}#${occurrence}`, hash(data));
  });
  return entries;
}

function sorted(layout: Map<string, string>): [string, string][] {
  return [...layout.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function hash(values: ArrayLike<number>): string {
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    weighted += values[i] * ((i % 97) + 1);
  }
  return `${values.length}:${sum.toFixed(4)}:${weighted.toFixed(4)}`;
}

function resources(scene: Scene): { geometries: Set<BufferGeometry>; materials: Set<Material> } {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  forEachResource(scene, {
    geometry: (geometry) => void geometries.add(geometry),
    material: (material) => void materials.add(material),
  });
  return { geometries, materials };
}

function watchDisposal(
  targets: Iterable<{ addEventListener: BufferGeometry['addEventListener'] }>,
) {
  const disposed = new Set<unknown>();
  for (const target of targets) {
    target.addEventListener('dispose', () => disposed.add(target));
  }
  return disposed;
}

describe.each(CASES)('reseeding the %s', (_name, build, decoration) => {
  it('moves decoration only and keeps every collider', () => {
    const environment = build();
    const ctx = stubContext();
    const colliders = environment.colliders;
    const snapshot = structuredClone(colliders);
    environment.init(ctx);
    const before = layout(ctx.scene);

    environment.reseedDecoration?.(1);
    const after = layout(ctx.scene);

    expect(environment.colliders).toBe(colliders);
    expect(environment.colliders).toEqual(snapshot);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    const moved = [...after.keys()].filter((key) => after.get(key) !== before.get(key));
    expect(moved.length, 'nothing moved').toBeGreaterThan(0);
    for (const key of moved) {
      expect(key.split('#')[0], `${key} moved, but it is not decoration`).toMatch(decoration);
    }

    environment.dispose();
  });

  it('is a function of the offset alone: the same pull gives the same world, and 0 the original', () => {
    const environment = build();
    const ctx = stubContext();
    environment.init(ctx);
    const original = layout(ctx.scene);

    environment.reseedDecoration?.(2);
    const second = layout(ctx.scene);
    environment.reseedDecoration?.(5);
    environment.reseedDecoration?.(2);
    expect(sorted(layout(ctx.scene))).toEqual(sorted(second));
    expect(sorted(second)).not.toEqual(sorted(original));

    environment.reseedDecoration?.(0);
    expect(sorted(layout(ctx.scene))).toEqual(sorted(original));

    environment.dispose();
  });

  it('keeps every material, releases what it replaces, and leaves nothing behind on dispose', () => {
    const environment = build();
    const ctx = stubContext();
    environment.init(ctx);
    const first = resources(ctx.scene);
    const instanced: InstancedMesh[] = [];
    ctx.scene.traverse((object) => {
      if (object instanceof InstancedMesh) {
        instanced.push(object);
      }
    });
    const disposedGeometries = watchDisposal(first.geometries);
    const disposedMaterials = watchDisposal(first.materials);
    const disposedInstances = watchDisposal(instanced);

    environment.reseedDecoration?.(1);
    const second = resources(ctx.scene);

    // The same materials: nothing new to compile.
    expect(second.materials).toEqual(first.materials);
    expect(disposedMaterials.size).toBe(0);
    // As many geometries as before, and every one that left the scene was released.
    expect(second.geometries.size).toBe(first.geometries.size);
    const replaced = [...first.geometries].filter((geometry) => !second.geometries.has(geometry));
    expect(replaced.length).toBeGreaterThan(0);
    expect(replaced.every((geometry) => disposedGeometries.has(geometry))).toBe(true);
    const retired = instanced.filter((mesh) => mesh.parent === null);
    expect(retired.every((mesh) => disposedInstances.has(mesh))).toBe(true);

    const disposedLater = watchDisposal(second.geometries);
    environment.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    expect([...second.geometries].every((geometry) => disposedLater.has(geometry))).toBe(true);
    expect([...first.materials].every((material) => disposedMaterials.has(material))).toBe(true);
  });

  it('does nothing before the world is built', () => {
    expect(() => build().reseedDecoration?.(1)).not.toThrow();
  });
});

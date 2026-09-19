import { BufferGeometry, InstancedMesh, Material, Mesh, Object3D, Texture } from 'three';

/**
 * Releases every GPU resource reachable from `root` and detaches it from the scene graph.
 *
 * Three keeps geometries, materials and textures alive until they are disposed explicitly, so this
 * is the single choke point that keeps `renderer.info.memory` flat across enter/exit cycles
 * (IMPLEMENTATION_PLAN.md §2). Textures marked `userData.managed` belong to a texture provider
 * (`AssetService` from M5) that refcounts and disposes them itself; they are left alone here.
 */

/** Marks a texture as owned by a provider, so `disposeObject3D` never frees it out from under others. */
export function markManaged<T extends Texture | Material | BufferGeometry>(resource: T): T {
  resource.userData['managed'] = true;
  return resource;
}

function isManaged(resource: { userData: Record<string, unknown> }): boolean {
  return resource.userData['managed'] === true;
}

/** What `forEachResource` reports; every callback is optional, so callers pay only for what they use. */
export interface ResourceVisitor {
  geometry?: (geometry: BufferGeometry) => void;
  /** Return `false` to skip the material's own textures. */
  material?: (material: Material) => boolean | void;
  texture?: (texture: Texture) => void;
}

/**
 * Walks every geometry, material and texture the scene graph under `root` references.
 *
 * Disposing, refcounting and counting all need the same traversal and differ only in what they do
 * at the leaves, so the rule for *where* resources hide lives here once.
 */
export function forEachResource(root: Object3D, visit: ResourceVisitor): void {
  root.traverse((object) => {
    const mesh = object as Partial<Mesh>;
    if (mesh.geometry) {
      visit.geometry?.(mesh.geometry);
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => visitMaterial(entry, visit));
    } else if (material) {
      visitMaterial(material, visit);
    }
  });
}

function visitMaterial(material: Material, visit: ResourceVisitor): void {
  if (visit.material?.(material) === false || !visit.texture) {
    return;
  }

  // Every map is a plain property on the material, so this catches `map`, `normalMap`,
  // `emissiveMap` and anything a future material adds without listing them by hand.
  for (const value of Object.values(material)) {
    if (value instanceof Texture) {
      visit.texture(value);
    }
  }
}

export function disposeObject3D(root: Object3D): void {
  root.removeFromParent();

  forEachResource(root, {
    geometry: (geometry) => {
      if (!isManaged(geometry)) {
        geometry.dispose();
      }
    },
    material: (material) => {
      if (isManaged(material)) {
        return false;
      }
      material.dispose();
      return true;
    },
    texture: (texture) => {
      if (!isManaged(texture)) {
        texture.dispose();
      }
    },
  });

  // Instance matrices and colours live outside the geometry; only `InstancedMesh.dispose()`
  // releases their GPU buffers.
  root.traverse((object) => {
    if (object instanceof InstancedMesh) {
      object.dispose();
    }
  });
}

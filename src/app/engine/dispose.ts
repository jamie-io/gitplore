import { Material, Mesh, Object3D, Texture } from 'three';

/**
 * Releases every GPU resource reachable from `root` and detaches it from the scene graph.
 *
 * Three keeps geometries, materials and textures alive until they are disposed explicitly, so this
 * is the single choke point that keeps `renderer.info.memory` flat across enter/exit cycles
 * (IMPLEMENTATION_PLAN.md §2).
 */
export function disposeObject3D(root: Object3D): void {
  root.removeFromParent();

  root.traverse((object) => {
    const mesh = object as Partial<Mesh>;
    mesh.geometry?.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: Material): void {
  // Every map is a plain property on the material, so this catches `map`, `normalMap`,
  // `emissiveMap` and anything a future material adds without listing them by hand.
  for (const value of Object.values(material)) {
    if (value instanceof Texture) {
      value.dispose();
    }
  }

  material.dispose();
}

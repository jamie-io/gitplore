import { BufferAttribute, BufferGeometry, Mesh, Object3D, Vector3 } from 'three';

/**
 * A plain float copy of a loaded model node's geometry, in the model's frame: its node transform
 * applied, and position, normal and colour (RGB) unpacked from whatever the optimiser packed them
 * into.
 *
 * `npm run assets:optimize` quantises vertex data (KHR_mesh_quantization) and moves the dequantising
 * scale into the node transform, so a loaded geometry is only meaningful together with its node:
 * baking the transform in here is what lets the caller merge copies into one geometry, or hand one
 * to an `InstancedMesh`, whose instance matrices then place it. The copy belongs to the caller; the
 * model's own geometry, shared through the asset service, is not touched.
 */
export function bakeGeometry(node: Object3D): BufferGeometry | null {
  const mesh = findMesh(node);
  if (!mesh) {
    return null;
  }
  node.updateWorldMatrix(true, true);
  const source = mesh.geometry;
  const baked = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const attribute = source.getAttribute(name);
    if (!attribute) {
      continue;
    }
    // getX/getY/getZ denormalise, and work on the interleaved buffers the optimiser writes.
    const values = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      values[i * 3] = attribute.getX(i);
      values[i * 3 + 1] = attribute.getY(i);
      values[i * 3 + 2] = attribute.getZ(i);
    }
    baked.setAttribute(name, new BufferAttribute(values, 3));
  }
  const index = source.getIndex();
  if (index) {
    baked.setIndex(Array.from({ length: index.count }, (_, i) => index.getX(i)));
  }
  // The mesh's transform relative to the model's root: the loader nests it under its node.
  const root = node.parent ?? node;
  root.updateWorldMatrix(true, false);
  const toModel = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  baked.applyMatrix4(toModel);
  baked.computeBoundingSphere();
  return baked;
}

function findMesh(node: Object3D): Mesh | null {
  let found: Mesh | null = null;
  node.traverse((object) => {
    if (!found && object instanceof Mesh) {
      found = object;
    }
  });
  return found;
}

/**
 * Moves a model node authored at `authoredAt` (in the model's frame) so it sits right in a group
 * standing at that same point: the lantern's body under its moving body group, the lever's liana
 * under the handle it swings on. Only the authored placement comes off: the node's transform also
 * carries the optimiser's dequantising offset and scale, which must stay.
 */
export function adoptNode(node: Object3D, authoredAt: Vector3): Object3D {
  node.position.sub(authoredAt);
  return node;
}

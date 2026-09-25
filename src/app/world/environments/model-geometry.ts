import { BufferAttribute, BufferGeometry, Color, Group, Mesh, Object3D, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetLike } from '@engine/asset.service';

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

/**
 * `geometry` with its vertex colours multiplied by `colour`, in place: a model painted white with
 * its ambient occlusion baked in takes a house's stucco or a language's colour this way. A geometry
 * without colours is painted `colour` outright.
 */
export function tintGeometry(geometry: BufferGeometry, colour: Color | number): BufferGeometry {
  const tint = new Color(colour);
  const count = geometry.getAttribute('position').count;
  const existing = geometry.getAttribute('color');
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = (existing ? existing.getX(i) : 1) * tint.r;
    values[i * 3 + 1] = (existing ? existing.getY(i) : 1) * tint.g;
    values[i * 3 + 2] = (existing ? existing.getZ(i) : 1) * tint.b;
  }
  geometry.setAttribute('color', new BufferAttribute(values, 3));
  return geometry;
}

/**
 * Baked copies merged into one geometry for one draw call, keeping the normals the model was
 * authored with (a bare `assemble` would recompute them). The parts are disposed.
 */
export function mergeBaked(parts: readonly BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries([...parts], false);
  parts.forEach((part) => part.dispose());
  if (!merged) {
    throw new Error('baked model parts do not share the same attributes');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Borrows the models at `urls` for as long as `use` takes: once all of them have arrived, `use`
 * gets them by URL unless `cancelled()` says their consumer has gone, and every copy that arrived is
 * handed straight back. The consumer keeps only what it baked. If any model fails to load, `use`
 * never runs and the consumer's procedural build stays; a missing model is no error worth showing.
 */
export function borrowModels(
  assets: AssetLike,
  urls: readonly string[],
  cancelled: () => boolean,
  use: (models: ReadonlyMap<string, Group>) => void,
): void {
  void Promise.allSettled(urls.map((url) => assets.model(url))).then((results) => {
    const models = new Map<string, Group>();
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        models.set(urls[index], result.value);
      }
    });
    try {
      if (models.size === urls.length && !cancelled()) {
        use(models);
      }
    } finally {
      models.forEach((_, url) => assets.releaseModel(url));
    }
  });
}

/** Where the empty `name` marks a point in the model's frame, or null if the model has none. */
export function markerPosition(model: Object3D, name: string): Vector3 | null {
  const marker = model.getObjectByName(name);
  if (!marker) {
    return null;
  }
  model.updateWorldMatrix(true, true);
  return marker.getWorldPosition(new Vector3()).applyMatrix4(model.matrixWorld.clone().invert());
}

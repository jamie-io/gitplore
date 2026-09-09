import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial } from 'three';
import { disposeObject3D } from './dispose';

/** Three dispatches a real `dispose` event, so nothing here needs a mock. */
function recordDisposals(
  ...targets: { addEventListener(type: 'dispose', fn: () => void): void }[]
) {
  const seen = new Set<number>();
  targets.forEach((target, index) => target.addEventListener('dispose', () => seen.add(index)));
  return seen;
}

describe('disposeObject3D', () => {
  it('disposes the geometry and material of a nested mesh', () => {
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const group = new Group();
    group.add(new Group().add(new Mesh(geometry, material)));
    const disposed = recordDisposals(geometry, material);

    disposeObject3D(group);

    expect(disposed).toEqual(new Set([0, 1]));
  });

  it('disposes every texture map hanging off a material', () => {
    const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const normalMap = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const material = new MeshStandardMaterial({ map, normalMap });
    const disposed = recordDisposals(map, normalMap);

    disposeObject3D(new Mesh(new BoxGeometry(), material));

    expect(disposed).toEqual(new Set([0, 1]));
  });

  it('disposes each entry of a multi-material mesh', () => {
    const first = new MeshStandardMaterial();
    const second = new MeshStandardMaterial();
    const disposed = recordDisposals(first, second);

    disposeObject3D(new Mesh(new BoxGeometry(), [first, second]));

    expect(disposed).toEqual(new Set([0, 1]));
  });

  it('detaches the root from its parent so the scene graph drops it', () => {
    const scene = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    scene.add(mesh);

    disposeObject3D(mesh);

    expect(scene.children).toEqual([]);
  });

  it('survives an empty group', () => {
    expect(() => disposeObject3D(new Group())).not.toThrow();
  });
});

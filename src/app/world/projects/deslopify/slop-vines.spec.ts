import {
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { SlopVines } from './slop-vines';

const ANCHORS = [new Vector3(1, 6, 2), new Vector3(-2, 5.5, -4), new Vector3(4, 7, -8)];

describe('SlopVines', () => {
  it('builds one deterministic seven-point vine and one instanced bud per anchor', () => {
    const vines = new SlopVines({ anchors: ANCHORS, seed: 17 });
    const repeat = new SlopVines({ anchors: ANCHORS, seed: 17 });
    const tubes = vines.object.children
      .flatMap((child) => child.children)
      .filter(
        (child): child is Mesh => child instanceof Mesh && child.geometry instanceof TubeGeometry,
      );
    const repeatTubes = repeat.object.children
      .flatMap((child) => child.children)
      .filter(
        (child): child is Mesh => child instanceof Mesh && child.geometry instanceof TubeGeometry,
      );
    const buds = vines.object.getObjectByName('slop-vine-buds');

    expect(vines.object.userData['vineCount']).toBe(ANCHORS.length);
    expect(tubes).toHaveLength(ANCHORS.length);
    expect(tubes.every((tube) => tube.userData['pointCount'] === 7)).toBe(true);
    expect(tubes.map((tube) => tube.userData['radius'])).toEqual(
      repeatTubes.map((tube) => tube.userData['radius']),
    );
    expect(new Set(tubes.map((tube) => tube.material)).size).toBe(1);
    expect(buds).toBeInstanceOf(InstancedMesh);
    expect((buds as InstancedMesh).count).toBe(ANCHORS.length);
    expect((buds as InstancedMesh).geometry).toBeInstanceOf(SphereGeometry);
    expect((buds as InstancedMesh).userData['radius']).toBe(0.07);
  });

  it('retreats at 2.6 per second, regrows at 0.3, and clamps to visual minimum and full size', () => {
    const vines = new SlopVines({ anchors: [ANCHORS[0]], seed: 1 });

    vines.update(0.2, () => true);
    expect(vines.object.children[0]?.scale.y).toBeCloseTo(1 - 0.2 * 2.6);

    vines.update(0.5, () => true);
    expect(vines.object.children[0]?.scale.y).toBeCloseTo(0.06);

    vines.update(0.5, () => false);
    expect(vines.object.children[0]?.scale.y).toBeCloseTo(0.21);

    vines.update(10, () => false);
    expect(vines.object.children[0]?.scale.y).toBe(1);
  });

  it('takes its retreat and regrowth from the flow when given', () => {
    const vines = new SlopVines({
      anchors: [ANCHORS[0]],
      seed: 1,
      rates: { retreat: 3, regrow: 0.35 },
    });

    vines.update(0.2, () => true);
    expect(vines.object.children[0]?.scale.y).toBeCloseTo(1 - 0.2 * 3);
    vines.update(0.2, () => false);
    expect(vines.object.children[0]?.scale.y).toBeCloseTo(1 - 0.2 * 3 + 0.2 * 0.35);
  });

  it('restores one vine through grow and snaps transitions under reduced motion', () => {
    const vines = new SlopVines({ anchors: ANCHORS.slice(0, 2), seed: 2, reducedMotion: true });

    vines.update(0.01, (index) => index === 0);
    expect(vines.object.children[0]?.scale.y).toBe(0.06);
    expect(vines.object.children[1]?.scale.y).toBe(1);

    vines.grow(0);
    expect(vines.object.children[0]?.scale.y).toBe(1);
  });

  it('resets every vine to full size', () => {
    const vines = new SlopVines({ anchors: ANCHORS, seed: 2 });

    vines.update(1, () => true);
    vines.reset();

    expect(vines.object.children.every((child) => child.scale.y === 1)).toBe(true);
  });

  it('disposes shared materials, geometries, and object graph', () => {
    const vines = new SlopVines({ anchors: ANCHORS, seed: 3 });
    const resources: { dispose: ReturnType<typeof vi.spyOn> }[] = [];
    vines.object.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.geometry) resources.push({ dispose: vi.spyOn(mesh.geometry, 'dispose') });
      const material = mesh.material as MeshStandardMaterial | undefined;
      if (material) resources.push({ dispose: vi.spyOn(material, 'dispose') });
    });

    vines.dispose();

    expect(vines.object.children).toEqual([]);
    expect(resources.every(({ dispose }) => dispose.mock.calls.length > 0)).toBe(true);
  });
});

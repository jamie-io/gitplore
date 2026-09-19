import { BoxGeometry, Color, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { HeightField } from '@engine/player/collision';
import {
  Exclusion,
  ScatterOptions,
  buildInstanced,
  cylinderColliders,
  isExcluded,
  scatter,
} from './scatter';

const FLAT: HeightField = { heightAt: () => 0 };
const SLOPE: HeightField = { heightAt: (x, z) => x * 0.1 + z * 0.2 };
const BASE: ScatterOptions = {
  seed: 5,
  count: 200,
  area: { inner: 10, outer: 50 },
  scale: [0.5, 1.5],
};

function meanNearestNeighbour(points: readonly { x: number; z: number }[]): number {
  const nearest = points.map((p, i) =>
    Math.min(...points.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.z - q.z))),
  );
  return nearest.reduce((sum, d) => sum + d, 0) / nearest.length;
}

describe('scatter', () => {
  it('is deterministic, so a rebuilt world looks the same', () => {
    expect(scatter(BASE, FLAT)).toEqual(scatter(BASE, FLAT));
  });

  it('fills the requested count when there is room, and never exceeds it', () => {
    expect(scatter(BASE, FLAT).length).toBe(200);
    expect(scatter({ ...BASE, maxAttempts: 50 }, FLAT).length).toBeLessThanOrEqual(50);
  });

  it('keeps every placement inside its annulus, around its own centre', () => {
    const area = { x: 30, z: -10, inner: 4, outer: 9 };
    for (const p of scatter({ ...BASE, area }, FLAT)) {
      const d = Math.hypot(p.x - 30, p.z + 10);
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it('honours every kind of exclusion', () => {
    const exclusions: Exclusion[] = [
      { kind: 'circle', x: 20, z: 0, radius: 8 },
      { kind: 'ring', x: 0, z: 0, inner: 28, outer: 32 },
      { kind: 'arc', x: 0, z: 0, radius: 40, halfWidth: 3, from: -0.5, to: 0.5 },
      { kind: 'segment', ax: 0, az: 0, bx: -50, bz: 0, halfWidth: 2 },
    ];
    const placements = scatter({ ...BASE, count: 400, exclusions }, FLAT);

    expect(placements.length).toBeGreaterThan(100);
    for (const p of placements) {
      expect(isExcluded(p.x, p.z, exclusions)).toBe(false);
    }
  });

  it('keeps placements apart when asked to', () => {
    const placements = scatter({ ...BASE, count: 60, minSpacing: 5 }, FLAT);

    for (let a = 0; a < placements.length; a++) {
      for (let b = a + 1; b < placements.length; b++) {
        expect(
          Math.hypot(placements[a].x - placements[b].x, placements[a].z - placements[b].z),
        ).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('stands every placement on the ground', () => {
    for (const p of scatter(BASE, SLOPE)) {
      expect(p.y).toBeCloseTo(SLOPE.heightAt(p.x, p.z), 10);
    }
  });

  it('gathers placements into groves when clusters are asked for', () => {
    const loose = scatter({ ...BASE, count: 80 }, FLAT);
    const grouped = scatter({ ...BASE, count: 80, clusters: { count: 4, radius: 5 } }, FLAT);

    expect(meanNearestNeighbour(grouped)).toBeLessThan(meanNearestNeighbour(loose));
  });

  it('draws scale, rotation and tint from their ranges', () => {
    for (const p of scatter(BASE, FLAT)) {
      expect(p.scale).toBeGreaterThanOrEqual(0.5);
      expect(p.scale).toBeLessThan(1.5);
      expect(p.rotation).toBeGreaterThanOrEqual(0);
      expect(p.rotation).toBeLessThan(Math.PI * 2);
      expect(p.tint).toBeGreaterThanOrEqual(0);
      expect(p.tint).toBeLessThan(1);
    }
  });
});

describe('isExcluded', () => {
  it('measures arcs the way arcAnchors does: angle 0 points down −Z', () => {
    const arc: Exclusion = {
      kind: 'arc',
      x: 0,
      z: 0,
      radius: 20,
      halfWidth: 2,
      from: -0.1,
      to: 0.1,
    };

    expect(isExcluded(0, -20, [arc])).toBe(true);
    expect(isExcluded(0, 20, [arc])).toBe(false);
    expect(isExcluded(20, 0, [arc])).toBe(false);
    expect(isExcluded(0, -23, [arc])).toBe(false);
  });

  it('treats a segment as a corridor with rounded ends', () => {
    const corridor: Exclusion = { kind: 'segment', ax: 0, az: 0, bx: 0, bz: -10, halfWidth: 1 };

    expect(isExcluded(0.5, -5, [corridor])).toBe(true);
    expect(isExcluded(0, -10.9, [corridor])).toBe(true);
    expect(isExcluded(1.5, -5, [corridor])).toBe(false);
    expect(isExcluded(0, -11.5, [corridor])).toBe(false);
  });
});

describe('buildInstanced', () => {
  const placements = [
    { x: 1, y: 2, z: 3, scale: 2, rotation: 0.5, tint: 0.25 },
    { x: -4, y: 0, z: 8, scale: 1, rotation: 0, tint: 0.75 },
  ];

  it('puts one instance at each placement, sunk by the requested depth', () => {
    const mesh = buildInstanced(new BoxGeometry(), new MeshStandardMaterial(), placements, {
      name: 'test',
      sink: 0.1,
    });
    const matrix = new Matrix4();
    const position = new Vector3();

    expect(mesh.count).toBe(2);
    mesh.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(1, 6);
    expect(position.y).toBeCloseTo(2 - 0.1 * 2, 6);
    expect(position.z).toBeCloseTo(3, 6);
    expect(mesh.name).toBe('test');
  });

  it('colours instances from their tint', () => {
    const tint = (t: number) => new Color(t, t, t);
    const mesh = buildInstanced(new BoxGeometry(), new MeshStandardMaterial(), placements, {
      name: 'tinted',
      tint,
    });
    const colour = new Color();

    mesh.getColorAt(1, colour);
    expect(colour.r).toBeCloseTo(0.75, 6);
  });

  it('leaves instance colours out without a tint function', () => {
    const mesh = buildInstanced(new BoxGeometry(), new MeshStandardMaterial(), placements, {
      name: 'plain',
    });

    expect(mesh.instanceColor).toBeNull();
  });
});

describe('cylinderColliders', () => {
  it('scales the trunk radius with each placement', () => {
    const colliders = cylinderColliders(
      [{ x: 3, y: 0, z: 4, scale: 2, rotation: 0, tint: 0 }],
      0.3,
    );

    expect(colliders).toEqual([{ kind: 'cylinder', x: 3, z: 4, radius: 0.6 }]);
  });
});

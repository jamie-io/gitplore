import { Box3, Mesh, MeshStandardMaterial, Object3D, Scene, Texture, Vector3 } from 'three';
import { Collider } from '@engine/player/collision';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { PlazaEnvironment } from './plaza';
import {
  ARCH,
  FACADE,
  GLIDE_RADIUS,
  RIDGE,
  STATIONS,
  STATION_RADIUS,
  houseRow,
} from './plaza-layout';
import { clearance } from './testing/clearance';
import { ProjectScene, ProjectSceneOptions } from '../project/project.scene';

const plaza = (reducedMotion = false) =>
  new PlazaEnvironment({ reducedMotion: () => reducedMotion });

const PLAZA_PROJECT: Project = {
  ...PROJECT_FIXTURES[0],
  languages: { TypeScript: 100, JavaScript: 40 },
  commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 20 ? 16 : 0)),
  createdAt: '2025-01-01T00:00:00Z',
  pushedAt: '2026-01-01T00:00:00Z',
  releases: [{ name: 'v1.0.0', date: '2025-07-01T00:00:00Z' }],
  stars: 4,
};

function projectScene(environment: PlazaEnvironment, project: Partial<Project> = {}): ProjectScene {
  const options: ProjectSceneOptions = {
    environment,
    project: { ...PLAZA_PROJECT, ...project },
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  };
  return new ProjectScene(options);
}

function sceneBounds(scene: Scene, name: string): Box3 {
  const object = scene.getObjectByName(name);
  expect(object, `missing Plaza project object ${name}`).toBeDefined();
  if (!object) {
    throw new Error(`Missing Plaza project object ${name}`);
  }
  return new Box3().setFromObject(object);
}

/** The smallest ground distance from the fountain to any vertex of the named object. */
function nearestToCentre(scene: Scene, name: string): number {
  const object = scene.getObjectByName(name);
  if (!object) {
    throw new Error(`Missing Plaza project object ${name}`);
  }
  let nearest = Infinity;
  const point = new Vector3();
  object.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const position = child.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      nearest = Math.min(nearest, Math.hypot(point.x, point.z));
    }
  });
  return nearest;
}

describe('PlazaEnvironment', () => {
  it('leaves the arrival point free, and the portal the whole opening of the arch', () => {
    const environment = plaza();

    // The portal stands in the arch at `spawn`; the visitor arrives a few metres in front of it.
    expect(
      clearance(environment.spawn.x, environment.spawn.z, environment.colliders),
    ).toBeGreaterThanOrEqual(ARCH.opening / 2 - 1e-9);
    expect(clearance(0, 13.5, environment.colliders)).toBeGreaterThanOrEqual(3);
  });

  it('looks north at the fountain from the arrival', () => {
    const environment = plaza();

    expect(environment.spawnYaw).toBe(0);
    expect(environment.spawn.toArray()).toEqual([0, 0, 17.5]);
  });

  it('leaves room around every exhibit spot', () => {
    const environment = plaza();
    const anchors = environment.anchors(1);

    expect(anchors).toHaveLength(1);
    expect(environment.anchors(0)).toEqual([]);
    for (const anchor of anchors) {
      expect(
        clearance(anchor.position[0], anchor.position[2], environment.colliders),
      ).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('stands the exhibit at the north-west station, facing the fountain', () => {
    const [anchor] = plaza().anchors(1);
    const board = STATIONS[1];

    expect(anchor.position).toEqual([board.prop.x, 0, board.prop.z]);
    expect(anchor.position[0]).toBeCloseTo(-7.78, 6);
    expect(anchor.position[2]).toBeCloseTo(-7.78, 6);
    expect(anchor.rotationY).toBeCloseTo(Math.PI / 4, 2);
  });

  it('lays the toys out at their stations, facing the fountain', () => {
    const toys = plaza().toyLayout();

    expect(toys.terminal.position.toArray()).toEqual([STATIONS[0].prop.x, 0, STATIONS[0].prop.z]);
    expect(toys.terminal.rotationY).toBeCloseTo((3 * Math.PI) / 4, 2);
    expect(toys.languages.position.toArray()).toEqual([STATIONS[3].prop.x, 0, STATIONS[3].prop.z]);
    expect(toys.languages.rotationY).toBeCloseTo((-3 * Math.PI) / 4, 2);
    expect(toys.ridge.from.toArray()).toEqual([RIDGE.from.x, 0, RIDGE.from.z]);
    expect(toys.ridge.to.toArray()).toEqual([RIDGE.to.x, 0, RIDGE.to.z]);
    expect(toys.releases).toEqual(toys.ridge);
    expect(toys.stars).toEqual(toys.ridge);
    // Every prop stands on the station ring, three metres behind its stand.
    for (const station of STATIONS) {
      expect(Math.hypot(station.prop.x, station.prop.z)).toBeCloseTo(STATION_RADIUS, 1);
      expect(Math.hypot(station.stand.x, station.stand.z)).toBeCloseTo(GLIDE_RADIUS, 1);
      expect(station.stand.yaw).toBeCloseTo(station.prop.rotationY, 6);
    }
  });

  it('runs the language row along the circle at the south-east station, clear of the glide ring', () => {
    const environment = plaza();
    const target = projectScene(environment, {
      languages: Object.fromEntries(
        Array.from({ length: 16 }, (_, index) => [`Sprache ${index}`, 1000 - index]),
      ),
    });
    const ctx = stubContext();
    target.init(ctx);
    ctx.scene.updateMatrixWorld(true);

    const bounds = sceneBounds(ctx.scene, 'language-pillars');
    const centre = bounds.getCenter(new Vector3());
    expect(Math.hypot(centre.x, centre.z)).toBeCloseTo(STATION_RADIUS, 0);
    expect(nearestToCentre(ctx.scene, 'language-pillars')).toBeGreaterThanOrEqual(9.35);

    target.dispose();
  });

  it('builds the houses around the square, never on it', () => {
    const inArch = (collider: Extract<Collider, { kind: 'aabb' }>) =>
      collider.minX >= ARCH.x - ARCH.width / 2 &&
      collider.maxX <= ARCH.x + ARCH.width / 2 &&
      collider.minZ >= ARCH.z - ARCH.depth / 2 &&
      collider.maxZ <= ARCH.z + ARCH.depth / 2;
    let piers = 0;
    for (const collider of plaza().colliders) {
      if (collider.kind !== 'aabb') {
        continue;
      }
      if (inArch(collider)) {
        piers++;
        continue;
      }
      const outside =
        collider.minX >= FACADE ||
        collider.maxX <= -FACADE ||
        collider.minZ >= FACADE ||
        collider.maxZ <= -FACADE;
      expect(outside).toBe(true);
    }
    expect(piers).toBe(2);
  });

  it('keeps a street open on the south side only', () => {
    const colliders = plaza().colliders;

    expect(clearance(0, FACADE + 2, colliders)).toBeGreaterThanOrEqual(1.5);
    for (const [x, z] of [
      [0, -FACADE - 2],
      [-FACADE - 2, 0],
      [FACADE + 2, 0],
    ] as const) {
      // Houses abut, so a point on the seam between two measures exactly 0: still no way through.
      expect(clearance(x, z, colliders)).toBeLessThanOrEqual(0);
    }
  });

  it('builds the same town on every visit', () => {
    expect(houseRow('north', 1, false)).toEqual(houseRow('north', 1, false));
    expect(plaza().colliders).toEqual(plaza().colliders);
  });

  it('keeps no rooftop, no lamp posts and one medallion per station', () => {
    const environment = plaza();
    const ctx = stubContext();
    environment.init(ctx);

    expect(ctx.scene.getObjectByName('plaza-rooftop')).toBeUndefined();
    expect(ctx.scene.getObjectByName('plaza-rooftop-stairs')).toBeUndefined();
    expect(ctx.scene.getObjectByName('lamps')).toBeUndefined();
    expect(environment.colliders.some((c) => c.kind === 'aabb' && c.top !== undefined)).toBe(false);
    const medallions = ctx.scene.getObjectByName('plaza-medallions');
    expect(medallions).toBeInstanceOf(Mesh);
    const bounds = new Box3().setFromObject(medallions!);
    expect(bounds.min.x).toBeCloseTo(-5.66 - 0.9, 1);
    expect(bounds.max.z).toBeCloseTo(5.66 + 0.9, 1);
    expect(bounds.max.y).toBeLessThan(0.05);

    environment.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('gives every lit mesh finite normals, so no pixel shades to NaN and blooms over the view', () => {
    const environment = plaza();
    const ctx = stubContext();
    environment.init(ctx);

    const missing: string[] = [];
    ctx.scene.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => material instanceof MeshStandardMaterial)) {
        return;
      }
      const normals = object.geometry.getAttribute('normal');
      const finite =
        normals !== undefined &&
        Array.from(normals.array as ArrayLike<number>).every((value) => Number.isFinite(value));
      if (!finite) {
        missing.push(object.name || object.uuid);
      }
    });

    expect(missing).toEqual([]);
    environment.dispose();
  });

  it('holds the fountain and everything else still under reduced motion', () => {
    const environment = plaza(true);
    const ctx = stubContext();
    environment.init(ctx);

    environment.update(0.5, ctx);

    expect(environment.shared.time.value).toBe(0);
    environment.dispose();
  });
});

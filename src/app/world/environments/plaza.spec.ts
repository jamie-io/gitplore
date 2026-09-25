import { readFileSync } from 'node:fs';
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { qualitySettings } from '@engine/capability.service';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { SPAWN_DISTANCE } from '../landmarks/base/landmark';
import { PLAZA_FOUNTAIN } from './architecture';
import { bakeGeometry, markerPosition } from './model-geometry';
import { PlazaEnvironment, TOWN_BLOCKS } from './plaza';
import {
  ARCH,
  CORNERS,
  CORNER_FOOTPRINTS,
  FACADE,
  GLIDE_RADIUS,
  HouseSpot,
  RIDGE,
  SPAWN,
  STATIONS,
  STATION_RADIUS,
  VARIANTS,
  houseRow,
} from './plaza-layout';
import { PLAZA_MODELS, TownModel, dressedCorner, dressedHouse, townModel } from './plaza-models';
import { PLAZA_TERMINAL_MODEL } from './props/terminal';
import { PLAZA_STEP_MODEL } from './data/commit-ridge';
import { PLAZA_PILLAR_MODEL } from './data/language-pillars';
import { clearance } from './testing/clearance';
import { ModelFiles, loadModelFile } from './testing/model-files';
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

const read = (path: string) => readFileSync(path);

/** A context whose asset service serves the published models, or fails every request. */
function modelContext(failing = false) {
  const assets = new ModelFiles(read, () => failing);
  return { ctx: stubContext(assets), assets };
}

function vertices(mesh: Object3D | undefined): number {
  expect(mesh).toBeInstanceOf(Mesh);
  return (mesh as Mesh).geometry.getAttribute('position').count;
}

/** Vertices of the named nodes of a published model. */
async function modelVertices(url: string, names: readonly string[]): Promise<number> {
  const model = await loadModelFile(read, `public/${url}`);
  return names.reduce((sum, name) => {
    const node = model.getObjectByName(name);
    return sum + (node ? bakeGeometry(node)!.getAttribute('position').count : 0);
  }, 0);
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

    // The portal stands in the arch at `spawn`; the visitor arrives `SPAWN_DISTANCE` in front of
    // it, where the nearest thing is the corner of an arch pier, about 2.83 m away.
    expect(
      clearance(environment.spawn.x, environment.spawn.z, environment.colliders),
    ).toBeGreaterThanOrEqual(ARCH.opening / 2 - 1e-9);
    expect(
      clearance(SPAWN.x, SPAWN.z - SPAWN_DISTANCE, environment.colliders),
    ).toBeGreaterThanOrEqual(2.5);
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
    expect(toys.ridge?.from.toArray()).toEqual([RIDGE.from.x, 0, RIDGE.from.z]);
    expect(toys.ridge?.to.toArray()).toEqual([RIDGE.to.x, 0, RIDGE.to.z]);
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

  it('builds its project scene without a seed lever, and takes it all down again', () => {
    const target = projectScene(plaza());
    const ctx = stubContext();
    target.init(ctx);

    expect(plaza().toyLayout().lever).toBeUndefined();
    expect(target.seedLever).toBeNull();
    expect(target.interactables.some(({ id }) => id.includes(':seed-lever'))).toBe(false);
    const names: string[] = [];
    ctx.scene.traverse((object) => names.push(object.name));
    expect(names.some((name) => name.includes(':seed-lever'))).toBe(false);
    expect(names).toContain(target.terminal.id);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
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

  it('stands the town in blocks of neighbours, so a block out of view is culled whole', () => {
    const environment = plaza();
    const ctx = stubContext();
    environment.init(ctx);

    const spots = TOWN_BLOCKS.flatMap((block) => block.spots);
    expect(spots).toEqual([
      ...houseRow('north', 81, false),
      ...houseRow('south', 82, true),
      ...houseRow('west', 83, false),
      ...houseRow('east', 84, false),
    ]);
    // Every corner block stands in exactly one block, beside houses of its own row.
    const corners = TOWN_BLOCKS.flatMap((block) => block.corners);
    expect([...corners].sort()).toEqual(CORNERS.map((_, index) => index));
    for (const block of TOWN_BLOCKS) {
      expect(block.spots.length).toBeGreaterThan(0);
      expect(block.spots.length).toBeLessThanOrEqual(2);
      // A block stands in one row, and never spans the street.
      const rows = new Set(
        block.spots.map(
          (spot) => `${spot.rotationY}:${spot.rotationY === Math.PI ? Math.sign(spot.x) : 0}`,
        ),
      );
      expect(rows.size).toBe(1);
      for (const index of block.corners) {
        const corner = CORNERS[index];
        const nearest = Math.min(
          ...block.spots.map((spot) => Math.hypot(spot.x - corner.x, spot.z - corner.z)),
        );
        expect(nearest).toBeLessThan(6);
      }
      expect(ctx.scene.getObjectByName(block.name)).toBeInstanceOf(Mesh);
    }
    expect(new Set(TOWN_BLOCKS.map((block) => block.name)).size).toBe(TOWN_BLOCKS.length);
    expect(ctx.scene.getObjectByName('plaza-corners')).toBeUndefined();

    environment.dispose();
  });

  it('swaps every proxy for its Blender model and keeps one mesh per block of the town', async () => {
    const { ctx, assets } = modelContext();
    const environment = plaza();
    environment.init(ctx);
    const proxies = TOWN_BLOCKS.map(
      (block) => (ctx.scene.getObjectByName(block.name) as Mesh).geometry,
    );
    await assets.settled();

    const corner = await modelVertices(PLAZA_MODELS.corner, ['stucco', 'shutters', 'trim']);
    for (const [index, block] of TOWN_BLOCKS.entries()) {
      let expected = corner * block.corners.length;
      for (const spot of block.spots) {
        expected += await modelVertices(PLAZA_MODELS.house(spot.variant), [
          'stucco',
          'shutters',
          'trim',
          'awning',
        ]);
      }
      const mesh = ctx.scene.getObjectByName(block.name) as Mesh;
      expect(mesh.geometry).not.toBe(proxies[index]);
      expect(vertices(mesh)).toBe(expected);
      expect(ctx.scene.children.filter((object) => object.name === block.name)).toHaveLength(1);
    }
    expect(vertices(ctx.scene.getObjectByName('fountain'))).toBe(
      await modelVertices(PLAZA_MODELS.fountain, ['fountain']),
    );
    expect(vertices(ctx.scene.getObjectByName('plaza-arch'))).toBe(
      await modelVertices(PLAZA_MODELS.arch, ['arch']),
    );
    expect(vertices(ctx.scene.getObjectByName('plaza-board'))).toBe(
      await modelVertices(PLAZA_MODELS.board, ['board']),
    );
    for (const [name, url, node] of [
      ['masts', PLAZA_MODELS.mast, 'mast'],
      ['benches', PLAZA_MODELS.bench, 'bench'],
      ['cypresses', PLAZA_MODELS.cypress, 'cypress'],
    ] as const) {
      const mesh = ctx.scene.getObjectByName(name);
      expect(mesh).toBeInstanceOf(InstancedMesh);
      expect(vertices(mesh)).toBe(await modelVertices(url, [node]));
    }

    environment.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('keeps the procedural square when the models fail to load', async () => {
    const { ctx, assets } = modelContext(true);
    const environment = plaza();
    environment.init(ctx);
    const proxies = TOWN_BLOCKS.map(
      (block) => (ctx.scene.getObjectByName(block.name) as Mesh).geometry,
    );
    await assets.settled();

    expect(assets.requested.length).toBeGreaterThan(0);
    TOWN_BLOCKS.forEach((block, index) => {
      expect((ctx.scene.getObjectByName(block.name) as Mesh).geometry).toBe(proxies[index]);
    });
    for (const name of ['fountain', 'plaza-arch', 'plaza-board', 'masts']) {
      expect(ctx.scene.getObjectByName(name)).toBeDefined();
    }
    expect(assets.releasedModels).toEqual([]);
    expect(() => environment.dispose()).not.toThrow();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('asks only for the models the square uses, and hands every one back', async () => {
    const { ctx, assets } = modelContext();
    const environment = plaza();
    environment.init(ctx);
    await assets.settled();

    const variants = [
      ...new Set(TOWN_BLOCKS.flatMap((block) => block.spots.map((s) => s.variant))),
    ];
    expect([...assets.requested].sort()).toEqual(
      [
        ...variants.map(PLAZA_MODELS.house),
        PLAZA_MODELS.corner,
        PLAZA_MODELS.fountain,
        PLAZA_MODELS.arch,
        PLAZA_MODELS.board,
        PLAZA_MODELS.mast,
        PLAZA_MODELS.bench,
        PLAZA_MODELS.cypress,
      ].sort(),
    );
    expect([...assets.releasedModels].sort()).toEqual([...assets.requested].sort());
    environment.dispose();
  });

  it('hands back models that arrive after the square has gone, without standing them', async () => {
    const { ctx, assets } = modelContext();
    const environment = plaza();
    environment.init(ctx);
    const north = ctx.scene.getObjectByName(TOWN_BLOCKS[0].name) as Mesh;
    const proxy = north.geometry;
    environment.dispose();
    await assets.settled();

    expect(north.geometry).toBe(proxy);
    expect([...assets.releasedModels].sort()).toEqual([...assets.requested].sort());
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('tints each house with its own stucco, shutter and awning colours', () => {
    const grey = (value: number) => {
      const geometry = new BoxGeometry(1, 1, 1);
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute(
        'color',
        new BufferAttribute(new Float32Array(count * 3).fill(value), 3),
      );
      return geometry;
    };
    const model: TownModel = {
      stucco: grey(0.5),
      shutters: grey(0.25),
      trim: grey(1),
      awning: grey(0.75),
      lamp: null,
    };
    const spot: HouseSpot = TOWN_BLOCKS[0].spots[0];
    const painted = { ...spot, options: { ...spot.options, awning: 0x2f6f9f } };

    const house = dressedHouse(painted, model);

    const colour = house.getAttribute('color');
    const at = (vertex: number) =>
      new Color(colour.getX(vertex), colour.getY(vertex), colour.getZ(vertex));
    const stucco = new Color(spot.options.stucco).multiplyScalar(0.5);
    const shutters = new Color(spot.options.shutters).multiplyScalar(0.25);
    const awning = new Color(0x2f6f9f).multiplyScalar(0.75);
    // Merged in order: stucco, shutters, trim, awning, 24 vertices each.
    for (const [vertex, expected] of [
      [0, stucco],
      [24, shutters],
      [48, new Color(1, 1, 1)],
      [72, awning],
    ] as const) {
      expect(at(vertex).r).toBeCloseTo(expected.r, 5);
      expect(at(vertex).g).toBeCloseTo(expected.g, 5);
      expect(at(vertex).b).toBeCloseTo(expected.b, 5);
    }
  });

  it('stretches a house over its spot and turns its front to the fountain', async () => {
    const spot = TOWN_BLOCKS.flatMap((block) => block.spots).find((s) => s.stretch > 1.01);
    expect(spot).toBeDefined();
    const model = await loadModelFile(read, `public/${PLAZA_MODELS.house(spot!.variant)}`);
    const house = dressedHouse(spot!, townModel(model)!);
    house.computeBoundingBox();
    const bounds = house.boundingBox!;
    const facesZ = spot!.rotationY === 0 || spot!.rotationY === Math.PI;
    const along = facesZ ? bounds.max.x - bounds.min.x : bounds.max.z - bounds.min.z;

    // The walls fill the stretched width; only the eaves and the verges may reach a little past.
    expect(along).toBeGreaterThanOrEqual(spot!.options.width - 0.01);
    expect(along).toBeLessThan(spot!.options.width + 1);
    expect(bounds.max.y).toBeGreaterThan(VARIANTS[spot!.variant].height);
    // The front stands on the facade line, towards the fountain; only the awning reaches past.
    const front = facesZ
      ? Math.min(Math.abs(bounds.min.z), Math.abs(bounds.max.z))
      : Math.min(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    expect(front).toBeGreaterThan(FACADE - 1.5);
    expect(front).toBeLessThanOrEqual(FACADE + 0.01);
  });

  it('stands every corner model inside its corner’s footprint', async () => {
    const model = townModel(await loadModelFile(read, `public/${PLAZA_MODELS.corner}`))!;
    const walls: TownModel = { ...model, shutters: model.stucco, trim: model.stucco };
    const paint = { stucco: 0xffffff, shutters: 0xffffff };
    CORNERS.forEach((corner, index) => {
      const footprint = CORNER_FOOTPRINTS[index];
      const inside = (geometry: BufferGeometry, slack: number) => {
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!;
        expect(bounds.min.x).toBeGreaterThanOrEqual(footprint.minX - slack);
        expect(bounds.max.x).toBeLessThanOrEqual(footprint.maxX + slack);
        expect(bounds.min.z).toBeGreaterThanOrEqual(footprint.minZ - slack);
        expect(bounds.max.z).toBeLessThanOrEqual(footprint.maxZ + slack);
        geometry.dispose();
      };
      // The walls fill the footprint, to the thickness of a render coat.
      inside(dressedCorner(corner, walls, paint), 0.07);
      // Only the eaves, the cornices and the sills reach past, as far as the houses' eaves.
      inside(dressedCorner(corner, model, paint), 0.45);
    });
  });

  it('lights a bulb in every wall lamp once the houses arrive', async () => {
    const { ctx, assets } = modelContext();
    const environment = plaza();
    environment.init(ctx);
    const before = vertices(ctx.scene.getObjectByName('bulbs'));
    await assets.settled();

    const lamps = TOWN_BLOCKS.flatMap((block) => block.spots).filter(
      (spot) => VARIANTS[spot.variant].lamp,
    ).length;
    expect(lamps).toBeGreaterThan(0);
    const after = vertices(ctx.scene.getObjectByName('bulbs'));
    expect((after - before) % lamps).toBe(0);
    expect(after).toBeGreaterThan(before);

    environment.dispose();
  });

  it('sets the water in the fountain model’s basins, below their kerbs', async () => {
    const model = await loadModelFile(read, `public/${PLAZA_MODELS.fountain}`);
    const fountain = bakeGeometry(model.getObjectByName('fountain')!)!;
    const position = fountain.getAttribute('position');
    const { lower, upper } = PLAZA_FOUNTAIN;
    let kerb = 0;
    let outer = 0;
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getZ(i));
      const y = position.getY(i);
      outer = Math.max(outer, r);
      // Between the pedestal and the kerb, the stone lies under the lower pool.
      if (r > 1.2 && r < lower.radius - 0.1) {
        expect(y).toBeLessThan(lower.level);
      }
      // The kerb rises over the water it holds.
      if (r >= lower.radius - 0.1 && r <= PLAZA_FOUNTAIN.radius + 0.15) {
        kerb = Math.max(kerb, y);
      }
    }
    expect(kerb).toBeGreaterThan(lower.level);
    expect(outer).toBeLessThanOrEqual(PLAZA_FOUNTAIN.radius + 0.2);
    expect(upper.level).toBeLessThan(PLAZA_FOUNTAIN.spout[1]);
    expect(lower.level).toBeCloseTo(0.46, 5);
    expect(upper.level).toBeCloseTo(2.03, 5);
    expect(upper.radius).toBeCloseTo(0.9, 5);
  });

  it('leaves the arch’s opening clear for the portal, centred where it hangs', async () => {
    const model = await loadModelFile(read, `public/${PLAZA_MODELS.arch}`);
    const portal = markerPosition(model, 'portal')!;
    expect(portal.x).toBeCloseTo(0, 3);
    expect(portal.y).toBeCloseTo(1.8, 3);
    expect(portal.z).toBeCloseTo(0, 3);

    const { ctx, assets } = modelContext();
    const environment = plaza();
    environment.init(ctx);
    await assets.settled();
    const arch = ctx.scene.getObjectByName('plaza-arch') as Mesh;
    const position = arch.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
      // Stood on the street at the arch, its cornice overhanging the piers a little.
      expect(Math.abs(z - ARCH.z)).toBeLessThan(ARCH.depth / 2 + 0.2);
      // The veil is 2.6 × 3.4 m about the portal: nothing of the arch stands in it.
      if (Math.abs(x - ARCH.x) < 1.3) {
        expect(y).toBeGreaterThan(portal.y + 1.7);
      }
    }
    environment.dispose();
  });

  it('frames the exhibit with the notice board, its face on the exhibit’s screen', async () => {
    const model = await loadModelFile(read, `public/${PLAZA_MODELS.board}`);
    const face = markerPosition(model, 'face')!;
    // The screen landmark draws its surface 1.9 m up, 9 cm in front of its centre.
    expect(face.y).toBeCloseTo(1.9, 3);
    expect(face.z).toBeCloseTo(0.09, 3);

    const environment = plaza();
    const ctx = stubContext();
    environment.init(ctx);
    const board = ctx.scene.getObjectByName('plaza-board')!;
    const [anchor] = environment.anchors(1);
    expect(board.position.toArray()).toEqual([...anchor.position]);
    expect(board.rotation.y).toBeCloseTo(anchor.rotationY, 9);
    environment.dispose();
  });

  it('dresses the project’s toys, exhibit and portal for the Plaza', async () => {
    const { ctx, assets } = modelContext();
    const environment = plaza();
    const target = projectScene(environment);
    target.init(ctx);

    expect(target.terminal.skin).toBe('plaza');
    expect(assets.requested).toContain(PLAZA_TERMINAL_MODEL);
    expect(assets.requested).toContain(PLAZA_STEP_MODEL);
    expect(assets.requested).toContain(PLAZA_PILLAR_MODEL);
    // The board is the exhibit's frame, and the arch the portal's: neither draws its own stone.
    const landmarks = ctx.scene.children.filter(
      (object) => object.name === `landmark:${PLAZA_PROJECT.slug}`,
    );
    expect(landmarks).toHaveLength(2);
    for (const landmark of landmarks) {
      for (const part of ['post', 'body', 'proxy']) {
        expect(landmark.getObjectByName(part)).toBeUndefined();
      }
    }
    const portalColliders = target.colliders.filter(
      (collider) =>
        collider.kind === 'cylinder' &&
        Math.abs(collider.z - SPAWN.z) < 0.01 &&
        Math.abs(Math.abs(collider.x) - 1.4) < 0.01,
    );
    expect(portalColliders).toEqual([]);

    await assets.settled();
    expect([...assets.releasedModels].sort()).toEqual([...assets.requested].sort());
    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('leaves the square’s own surfaces to the plain fog on the lowest tier, as it does the floor', () => {
    const hazed = (quality: 'low' | 'medium') => {
      const environment = plaza();
      const ctx = { ...stubContext(), quality: qualitySettings(quality) };
      environment.init(ctx);
      const keys = [
        'plaza-arch',
        'fountain',
        'cypresses',
        'plaza-medallions',
        TOWN_BLOCKS[0].name,
      ].map((name) =>
        (
          (ctx.scene.getObjectByName(name) as Mesh).material as MeshStandardMaterial
        ).customProgramCacheKey(),
      );
      environment.dispose();
      return keys.map((key) => key.includes('atmosphere'));
    };

    expect(hazed('low')).toEqual([false, false, false, false, false]);
    expect(hazed('medium')).toEqual([true, true, true, true, true]);
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

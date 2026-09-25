import { InstancedMesh, Matrix4, Mesh, Object3D, Texture, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import type { Collider } from '@engine/player/collision';
import { PLAYER_RADIUS } from '@engine/player/player-controller';
import type { Project } from '@content/project.model';
import { mergedProjects } from '../../../../scripts/lib/portfolio.mjs';
import { createEnvironment } from '../environments/create-environment';
import { LIANA, STELE } from '../environments/jungle-layout';
import { STATIONS } from '../environments/plaza-layout';
import { clearance } from '../environments/testing/clearance';
import { createProjectScene } from './create-project-scene';
import { ProjectScene, TOY_SIDE_OFFSET } from './project.scene';

/** Metres every toy keeps from anything else that blocks, and from the T9 data objects. */
const ROOM = 0.5;
const DATA_OBJECTS = new Set(['commit-ridge', 'language-pillars', 'release-markers']);

const projects = mergedProjects() as Project[];

async function build(project: Project): Promise<ProjectScene> {
  return createProjectScene({
    environment: await createEnvironment(project.environment, { reducedMotion: () => true }),
    project,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

/** Points along a collider's outline, dense enough that no prop slips between two of them. */
function outline(collider: Collider): Vector3[] {
  if (collider.kind === 'cylinder') {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      return new Vector3(
        collider.x + Math.cos(angle) * collider.radius,
        0,
        collider.z + Math.sin(angle) * collider.radius,
      );
    });
  }
  const points: Vector3[] = [];
  const step = 0.2;
  for (let x = collider.minX; x <= collider.maxX + 1e-9; x += step) {
    points.push(new Vector3(x, 0, collider.minZ), new Vector3(x, 0, collider.maxZ));
  }
  for (let z = collider.minZ; z <= collider.maxZ + 1e-9; z += step) {
    points.push(new Vector3(collider.minX, 0, z), new Vector3(collider.maxX, 0, z));
  }
  return points;
}

/** Every vertex of the named objects, in world space. */
function vertices(root: Object3D, names: ReadonlySet<string>): Vector3[] {
  const points: Vector3[] = [];
  const instance = new Matrix4();
  const world = new Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!names.has(object.name) || !(object instanceof Mesh)) {
      return;
    }
    const position = object.geometry.getAttribute('position');
    const count = object instanceof InstancedMesh ? object.count : 1;
    for (let index = 0; index < count; index++) {
      world.copy(object.matrixWorld);
      if (object instanceof InstancedMesh) {
        object.getMatrixAt(index, instance);
        world.multiply(instance);
      }
      for (let vertex = 0; vertex < position.count; vertex++) {
        points.push(new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(world));
      }
    }
  });
  return points;
}

/** Everything the toys must keep clear of, in one built scene. */
async function expectToysClear(project: Project): Promise<void> {
  const scene = await build(project);
  // `seedLever` is `null` for an environment that lays out no lever, the Plaza among them; skip
  // its assertions rather than fail on a toy that was never built.
  const toys = [scene.terminal, scene.seedLever].filter((toy) => toy !== null);
  const own = new Set<Collider>(toys.flatMap((toy) => toy.colliders));
  const others = scene.colliders.filter((collider) => !own.has(collider));

  const walk = scene.landmarks[0].position.clone().sub(scene.arrival.position).setY(0);
  const length = walk.length();
  walk.normalize();

  const ctx = stubContext();
  scene.init(ctx);
  const data = vertices(ctx.scene, DATA_OBJECTS);
  expect(data.length, 'the data objects were not found').toBeGreaterThan(0);

  for (const toy of toys) {
    const where = `${toy.id} at (${toy.position.x.toFixed(2)}, ${toy.position.z.toFixed(2)})`;

    if (project.environment === 'jungle') {
      // The jungle lays its toys out itself, at the spots its layout keeps clear for them.
      const spot = toy === scene.terminal ? STELE : LIANA;
      expect(toy.position.x, `${where} is not at its spot`).toBeCloseTo(spot.x, 5);
      expect(toy.position.z, `${where} is not at its spot`).toBeCloseTo(spot.z, 5);
    } else if (project.environment === 'plaza') {
      // The Plaza stands the terminal at its south-west station and builds no seed lever.
      const { prop } = STATIONS[0];
      expect(toy, `${where} is not the terminal`).toBe(scene.terminal);
      expect(toy.position.x, `${where} is not at its station`).toBeCloseTo(prop.x, 5);
      expect(toy.position.z, `${where} is not at its station`).toBeCloseTo(prop.z, 5);
    } else {
      const from = toy.position.clone().sub(scene.arrival.position).setY(0);
      const along = from.dot(walk);
      const lateral = Math.abs(from.x * walk.z - from.z * walk.x);
      expect(along, `${where} is not beside the walk`).toBeGreaterThan(0);
      expect(along, `${where} is not beside the walk`).toBeLessThan(length);
      expect(lateral, `${where} stands on the walk`).toBeCloseTo(TOY_SIDE_OFFSET, 5);
    }

    if (toy === scene.terminal) {
      const reading = scene.terminal.reading;
      expect(
        clearance(reading.x, reading.z, scene.colliders),
        `the reading spot in front of ${where} is blocked`,
      ).toBeGreaterThan(PLAYER_RADIUS);
    }

    const footprint = toy.colliders.flatMap(outline);
    const blocked = Math.min(...footprint.map((point) => clearance(point.x, point.z, others)));
    expect(blocked, `${where} is too close to a collider`).toBeGreaterThan(ROOM);

    const nearestData = Math.min(
      ...data.map((point) => clearance(point.x, point.z, toy.colliders)),
    );
    expect(nearestData, `${where} is too close to a data object`).toBeGreaterThan(ROOM);

    const [prompt] = toy.interactables;
    for (const other of scene.interactables.filter((entry) => entry !== prompt)) {
      const gap = Math.hypot(
        other.position.x - prompt.position.x,
        other.position.z - prompt.position.z,
      );
      expect(gap, `${where} stands inside ${other.id}'s reach`).toBeGreaterThan(other.radius);
      expect(gap, `${other.id} stands inside ${where}'s reach`).toBeGreaterThan(prompt.radius);
    }
  }

  scene.dispose();
}

describe('the terminal and the seed lever', () => {
  it.each(projects.map((project) => [project.slug, project] as const))(
    'in %s: beside the walk, clear of every collider, data object and other prompt',
    async (_slug, project) => {
      await expectToysClear(project);
    },
  );

  // The fullest data a repository can bring: the longest pillar row, every release cairn and a
  // ridge with a slab per bucket, in each environment a project world can use.
  it.each(['showroom', 'jungle', 'plaza'] as const)(
    'in a %s world with every data object at its largest',
    async (environment) => {
      const [first] = projects;
      await expectToysClear({
        ...first,
        slug: `toy-placement-${environment}`,
        environment,
        languages: Object.fromEntries(
          Array.from({ length: 16 }, (_, index) => [`Sprache ${index}`, 1000 - index]),
        ),
        commitBuckets: Array.from({ length: 52 }, (_, index) => 1 + (index % 9) * 12),
        releases: Array.from({ length: 16 }, (_, index) => ({
          name: `v${index}.0.0`,
          date: `2025-0${1 + (index % 9)}-01T00:00:00Z`,
        })),
      });
    },
  );
});

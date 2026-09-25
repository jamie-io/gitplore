import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Vector3,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { QualityTier, qualitySettings } from '@engine/capability.service';
import { Collider, floorHeightAt } from '@engine/player/collision';
import {
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from '@engine/player/player-controller';
import { BOOM_LENGTH, BOOM_RADIUS } from '@engine/player/third-person-rig';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { DSCHUNGEL } from './mood';
import {
  CAVE,
  FOLIAGE,
  JUNGLE_SHADOW_NORMAL_BIAS,
  JungleEnvironment,
  POOL,
  POOL_LEVEL,
  RILL_LEVEL,
  SLOP_AIR,
  SLOP_TINT,
  STAGE,
  STAGE_FLOOR,
  ROCKS_MODEL,
  jungleHeightAt,
} from './jungle';
import { MARKER_OFFSET } from './data/release-markers';
import { ARCH_GLOW_MATERIAL, ARCH_MODEL } from './jungle-bridge';
import { CAVE_CLIFF_MODEL } from './jungle-cave';
import {
  ARCH,
  BAMBOO,
  BOARDWALK,
  BOWL,
  CAIRN,
  CLIFF,
  DECK,
  EXHIBIT,
  FIREFLY_GLADE,
  LIANA,
  NORTH_LOOP,
  POOL_DEPTH,
  PORTAL,
  RILL,
  STATION_STANDS,
  STEPS,
  STELE,
  WALL,
  WALL_SPUR,
  beyondBowl,
  distanceToPaths,
  inBowl,
  inNiche,
} from './jungle-layout';
import { COMMIT_STEPS_MODEL } from './jungle-steps';
import { SPAWN_DISTANCE } from '../landmarks/base/landmark';
import { isExcluded } from './scatter';
import { clearance } from './testing/clearance';

const jungle = (reducedMotion = false) =>
  new JungleEnvironment({ reducedMotion: () => reducedMotion });

function contextAt(tier: QualityTier): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function compile(material: MeshStandardMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
    defines: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

function instanced(ctx: WorldContext, name: string): InstancedMesh {
  const mesh = ctx.scene.getObjectByName(name);
  if (!(mesh instanceof InstancedMesh)) {
    throw new Error(`no instanced ${name} in the scene`);
  }
  return mesh;
}

/** Every instance's root position and its horizontal scale. */
function roots(mesh: InstancedMesh, position: Vector3): [number, number, number, number][] {
  const matrix = new Matrix4();
  const result: [number, number, number, number][] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    const scale = new Vector3().setFromMatrixColumn(matrix, 0).length();
    result.push([position.x, position.y, position.z, scale]);
  }
  return result;
}

/** Walks `player` to each waypoint in turn at walking pace; fails the spec where it gets stuck. */
function walk(
  player: PlayerController,
  environment: JungleEnvironment,
  waypoints: readonly { readonly x: number; readonly z: number }[],
): void {
  for (const waypoint of waypoints) {
    for (let frame = 0; frame < 60 * 30; frame++) {
      const dx = waypoint.x - player.position.x;
      const dz = waypoint.z - player.position.z;
      if (Math.hypot(dx, dz) < 0.1) {
        break;
      }
      player.yaw = Math.atan2(-dx, -dz);
      player.update(
        1 / 60,
        { ...NO_INTENT, forward: 1 },
        environment.ground,
        environment.colliders,
      );
    }
    expect(
      Math.hypot(waypoint.x - player.position.x, waypoint.z - player.position.z),
      `stuck short of ${waypoint.x.toFixed(2)}, ${waypoint.z.toFixed(2)}`,
    ).toBeLessThan(0.2);
  }
}

/** A player standing at (x, z), dropped from `y` metres up onto whatever is walkable there. */
function standAt(x: number, z: number, y = jungleHeightAt(x, z)): PlayerController {
  const player = new PlayerController();
  player.teleport(new Vector3(x, y + PLAYER_EYE_HEIGHT, z));
  return player;
}

function arrive(environment: JungleEnvironment): PlayerController {
  const player = new PlayerController();
  player.teleport(environment.spawn.clone().setY(environment.spawn.y + PLAYER_EYE_HEIGHT));
  return player;
}

/** Whether a body standing at (x, z) would overlap any of `colliders`. */
function blocked(x: number, z: number, colliders: readonly Collider[]): boolean {
  return colliders.some((collider) =>
    collider.kind === 'cylinder'
      ? Math.hypot(x - collider.x, z - collider.z) < collider.radius + PLAYER_RADIUS
      : x > collider.minX - PLAYER_RADIUS &&
        x < collider.maxX + PLAYER_RADIUS &&
        z > collider.minZ - PLAYER_RADIUS &&
        z < collider.maxZ + PLAYER_RADIUS,
  );
}

/**
 * Floods the cells a body fits on, 0.5 m apart, from the portal through `walls`, and returns the
 * first one `reached` accepts, or `null` if the flood never gets there.
 */
function flood(
  walls: readonly Collider[],
  reached: (x: number, z: number) => boolean,
): string | null {
  const cell = 0.5;
  const minX = -40;
  const maxX = 40;
  const minZ = -32;
  const maxZ = 30;
  const columns = Math.round((maxX - minX) / cell) + 1;
  const rows = Math.round((maxZ - minZ) / cell) + 1;
  const seen = new Uint8Array(columns * rows);
  const start =
    Math.round((PORTAL.z - minZ) / cell) * columns + Math.round((PORTAL.x - minX) / cell);
  const queue: number[] = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const at = queue.pop()!;
    const column = at % columns;
    const row = (at - column) / columns;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= columns || r >= rows || seen[r * columns + c]) {
        continue;
      }
      seen[r * columns + c] = 1;
      const x = minX + c * cell;
      const z = minZ + r * cell;
      if (blocked(x, z, walls)) {
        continue;
      }
      if (reached(x, z)) {
        return `${x}, ${z}`;
      }
      queue.push(r * columns + c);
    }
  }
  return null;
}

/** Whether (x, z) lies inside the cave, the one walkable place past the bowl's ellipse. */
function inCave(x: number, z: number): boolean {
  return x > CAVE.x0 && x < CAVE.x1 && z > CAVE.z0 && z < CAVE.z1 + 0.5;
}

describe('JungleEnvironment', () => {
  it('stands every tree, fern, boulder and plant inside the bowl, off the walked lines', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const position = new Vector3();
    const kinds = ['kapok', 'palm', 'tree-fern', 'boulder'];
    const meshes = ctx.scene.children.filter(
      (object): object is InstancedMesh =>
        object instanceof InstancedMesh && kinds.some((kind) => object.name.startsWith(kind)),
    );
    let tall = 0;
    for (const mesh of meshes) {
      for (const [x, , z] of roots(mesh, position)) {
        tall++;
        expect(inBowl(x, z), `${mesh.name} at ${x}, ${z}`).toBe(true);
        expect(isExcluded(x, z, STAGE), `${mesh.name} at ${x}, ${z}`).toBe(false);
        expect(distanceToPaths(x, z), `${mesh.name} at ${x}, ${z}`).toBeGreaterThan(1.4);
      }
    }
    expect(tall).toBeGreaterThan(40);
    for (const [x, , z] of roots(instanced(ctx, 'plants'), position)) {
      expect(inBowl(x, z), `plant at ${x}, ${z}`).toBe(true);
      expect(distanceToPaths(x, z), `plant at ${x}, ${z}`).toBeGreaterThan(1.4);
    }
    environment.dispose();
  });

  it('stands no tree, fern or boulder within 2 m of the camera behind any station', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const position = new Vector3();
    const kinds = ['kapok', 'palm', 'tree-fern', 'boulder'];
    const meshes = ctx.scene.children.filter(
      (object): object is InstancedMesh =>
        object instanceof InstancedMesh && kinds.some((kind) => object.name.startsWith(kind)),
    );
    for (const [id, stand] of Object.entries(STATION_STANDS)) {
      // The boom hangs straight back from the head: (sin yaw, cos yaw) in the player's convention.
      const boom = {
        kind: 'segment' as const,
        ax: stand.x,
        az: stand.z,
        bx: stand.x + Math.sin(stand.yaw) * BOOM_LENGTH,
        bz: stand.z + Math.cos(stand.yaw) * BOOM_LENGTH,
        halfWidth: 2,
      };
      for (const mesh of meshes) {
        for (const [x, , z] of roots(mesh, position)) {
          expect(isExcluded(x, z, [boom]), `${mesh.name} at ${x}, ${z} behind ${id}`).toBe(false);
        }
      }
    }
    environment.dispose();
  });

  it('keeps every crown and the canopy 4 m off the view down the axis, portal to pool', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const kinds = ['kapok', 'palm', 'tree-fern', 'canopy'];
    const meshes = ctx.scene.children.filter(
      (object): object is InstancedMesh =>
        object instanceof InstancedMesh && kinds.some((kind) => object.name.startsWith(kind)),
    );
    expect(meshes.length).toBeGreaterThanOrEqual(kinds.length);
    const matrix = new Matrix4();
    const leaf = new Vector3();
    let crowns = 0;
    for (const mesh of meshes) {
      const vertices = mesh.geometry.getAttribute('position');
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        // The nearest any part of it comes to the axis, turned, tilted and scaled as it stands.
        let nearest = Infinity;
        for (let v = 0; v < vertices.count; v++) {
          leaf.fromBufferAttribute(vertices, v).applyMatrix4(matrix);
          const along = Math.min(Math.max(leaf.z, POOL.z), PORTAL.z);
          nearest = Math.min(nearest, Math.hypot(leaf.x - PORTAL.x, leaf.z - along));
        }
        expect(nearest, `${mesh.name} #${i}`).toBeGreaterThan(4);
        crowns++;
      }
    }
    expect(crowns).toBeGreaterThan(100);
    environment.dispose();
  });

  it('keeps every grove collider wholly inside the bowl', () => {
    const environment = jungle();
    const fixed = new Set<Collider>([
      ...environment.bridge.colliders,
      ...environment.steps.colliders,
      ...environment.cave.colliders,
    ]);
    // Past the deck's, the steps' and the cliff's own: the pool, the edge ring (centred outside
    // the ellipse) and the groves.
    const groves = environment.colliders.filter(
      (collider) =>
        collider.kind === 'cylinder' &&
        !fixed.has(collider) &&
        beyondBowl(collider.x, collider.z) < 0 &&
        Math.hypot((collider.x - POOL.x) / POOL.rx, (collider.z - POOL.z) / POOL.rz) > 1,
    );
    expect(groves.length).toBeGreaterThan(40);
    for (const collider of groves) {
      if (collider.kind === 'cylinder') {
        expect(beyondBowl(collider.x, collider.z) + collider.radius).toBeLessThan(0);
      }
    }
  });

  it('walks a visitor from the portal over the boardwalk, up the steps and over the deck', () => {
    const environment = jungle();
    const player = arrive(environment);

    walk(player, environment, [...BOARDWALK.slice(1), STEPS.to]);
    // On the top step, not the marsh under it.
    expect(player.position.y - PLAYER_EYE_HEIGHT).toBeGreaterThan(STEPS.top - 0.2);
    walk(player, environment, [ARCH]);
    expect(player.position.y).toBeCloseTo(DECK.height + PLAYER_EYE_HEIGHT, 5);
    walk(player, environment, [{ x: 0, z: -4 }]);
    // Down the ramp to the glade.
    expect(player.position.y - PLAYER_EYE_HEIGHT).toBeCloseTo(jungleHeightAt(0, -4), 1);
  });

  it('walks a visitor round the north loop and in behind the falls to the stele', () => {
    const environment = jungle();
    const player = standAt(0, -4);
    const inside = NORTH_LOOP.findIndex(({ x, z }) => x === 0 && z < CAVE.z1);
    walk(player, environment, [...NORTH_LOOP.slice(1, inside + 1), { x: 0, z: STELE.z + 0.6 }]);
    expect(player.position.y - PLAYER_EYE_HEIGHT).toBeCloseTo(CAVE.floor, 1);
    walk(player, environment, NORTH_LOOP.slice(inside));
    // And out along the spur to the feed wall's stand.
    walk(player, environment, [NORTH_LOOP[2], ...WALL_SPUR]);
  });

  it('walks from the test hook on the top steps to the arch, facing north', () => {
    const environment = jungle();
    const player = standAt(ARCH.x, ARCH.z + 3, STEPS.top);
    for (let frame = 0; frame < 60 * 3; frame++) {
      player.yaw = 0;
      player.update(
        1 / 60,
        { ...NO_INTENT, forward: 1 },
        environment.ground,
        environment.colliders,
      );
      if (player.position.z < ARCH.z) {
        break;
      }
    }
    expect(player.position.z).toBeLessThan(ARCH.z);
    expect(player.position.y).toBeCloseTo(DECK.height + PLAYER_EYE_HEIGHT, 5);
  });

  it('blocks the rill beside the deck and lets the visitor over it on the deck', () => {
    const environment = jungle();
    const beside = standAt(4, 2);
    for (let frame = 0; frame < 60 * 4; frame++) {
      beside.yaw = 0;
      beside.update(
        1 / 60,
        { ...NO_INTENT, forward: 1 },
        environment.ground,
        environment.colliders,
      );
    }
    expect(beside.position.z).toBeGreaterThan(RILL.centreZ(4) + RILL.halfWidth);

    const onDeck = standAt(0, 2, DECK.height);
    walk(onDeck, environment, [{ x: 0, z: -2 }]);
  });

  it('closes the glade off from the arrival everywhere but the deck', () => {
    const environment = jungle();
    // With the deck taken for a wall, nothing north of the rill is reachable from the portal:
    // the rill's band, the bowl's edge and the cliff must seal every other way round.
    const deck = {
      kind: 'aabb' as const,
      minX: ARCH.x - DECK.halfWidth,
      maxX: ARCH.x + DECK.halfWidth,
      minZ: ARCH.z - DECK.halfLength,
      maxZ: ARCH.z + DECK.halfLength,
    };
    const walls = [...environment.colliders.filter((c) => c.top === undefined), deck];
    expect(flood(walls, (x, z) => z < RILL.centreZ(x) - RILL.halfWidth)).toBe(null);
  });

  it('lets no one out of the bowl but into the cave and the return portal’s niche', () => {
    const environment = jungle();
    const walls = environment.colliders.filter((c) => c.top === undefined);
    expect(flood(walls, (x, z) => beyondBowl(x, z) > 0 && !inCave(x, z) && !inNiche(x, z))).toBe(
      null,
    );
  });

  it('walks nobody across the rill beside the deck, jumping or not', () => {
    const environment = jungle();
    for (const x of [-4, 4, -15, 20]) {
      const z = RILL.centreZ(x) + 4;
      const player = standAt(x, z);
      for (let frame = 0; frame < 60 * 4; frame++) {
        player.yaw = 0;
        player.update(
          1 / 60,
          { ...NO_INTENT, forward: 1, jump: frame % 30 === 0 },
          environment.ground,
          environment.colliders,
        );
      }
      expect(player.position.z, `crossed at ${x}`).toBeGreaterThan(RILL.centreZ(x));
    }
  });

  it('stands the deck over the water, 2.4 m up', () => {
    const environment = jungle();
    expect(
      floorHeightAt(ARCH.x, ARCH.z, DECK.height, environment.ground, environment.colliders),
    ).toBe(DECK.height);
    expect(jungleHeightAt(ARCH.x, RILL.centreZ(ARCH.x))).toBeLessThan(RILL_LEVEL - 0.6);
  });

  it('lays the rill and the pool at their own water lines', () => {
    const ctx = stubContext();
    const environment = jungle();
    environment.init(ctx);
    const water: Mesh[] = [];
    ctx.scene.traverse((object) => {
      if (object instanceof Mesh && object.name === 'water') {
        water.push(object);
      }
    });

    expect(water.map((mesh) => mesh.position.y).sort()).toEqual([RILL_LEVEL, POOL_LEVEL]);
    environment.dispose();
  });

  it('builds the deck and sets the arch on it, and hands the arch back when it goes', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const environment = jungle();
    environment.init(ctx);

    expect(ctx.scene.getObjectByName('bridge')).toBeDefined();
    expect(ctx.scene.getObjectByName('arch-proxy')).toBeDefined();
    expect(assets.requested).toContain(ARCH_MODEL);
    await assets.resolve(new Group());
    expect(ctx.scene.getObjectByName('arch-model')).toBeDefined();
    expect(ctx.scene.getObjectByName('arch-proxy')).toBeUndefined();
    const arch = ctx.scene.getObjectByName('deslopify-arch')!;
    expect([arch.position.x, arch.position.y, arch.position.z]).toEqual([
      ARCH.x,
      DECK.height,
      ARCH.z,
    ]);

    environment.dispose();
    expect(assets.releasedModels).toEqual([ARCH_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('hazes the arch glow copy and changes its intensity with the clearing', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const environment = jungle();
    const original = new MeshStandardMaterial({ name: ARCH_GLOW_MATERIAL });
    const originalIntensity = original.emissiveIntensity;
    const glow = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), original);
    const model = new Group();
    model.add(glow);
    environment.init(ctx);

    await assets.resolve(model);

    expect(glow.material).toBeInstanceOf(MeshStandardMaterial);
    expect(glow.material).not.toBe(original);
    expect(original.customProgramCacheKey()).not.toContain('atmosphere');
    expect((glow.material as MeshStandardMaterial).customProgramCacheKey()).toContain('atmosphere');

    environment.setSlop(1);
    const slopIntensity = (glow.material as MeshStandardMaterial).emissiveIntensity;
    environment.setSlop(0);
    const clearIntensity = (glow.material as MeshStandardMaterial).emissiveIntensity;
    expect(slopIntensity).toBeLessThan(clearIntensity);
    expect(original.emissiveIntensity).toBe(originalIntensity);

    environment.dispose();
  });

  it('asks for the arch, the steps, the cliff and the boulders, in that order', () => {
    const assets = new StubAssets();
    const environment = jungle();
    environment.init(stubContext(assets));

    expect(assets.requested).toEqual([
      ARCH_MODEL,
      COMMIT_STEPS_MODEL,
      CAVE_CLIFF_MODEL,
      ROCKS_MODEL,
    ]);
    environment.dispose();
  });

  it('requests and swaps the authored boulders, then releases their model', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const environment = jungle();
    environment.init(ctx);
    // The arch, the steps and the cliff come first; none of them is authored here.
    for (let i = 0; i < 3; i++) {
      await assets.reject();
    }

    const boulders = ['boulder-0', 'boulder-1'].map((name) => instanced(ctx, name));
    const oldGeometries = boulders.map((mesh) => mesh.geometry);
    const oldDisposals = oldGeometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    const counts = boulders.map((mesh) => mesh.count);
    const model = new Group();
    for (const name of ['boulder-0', 'boulder-1']) {
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
      mesh.name = name;
      model.add(mesh);
    }

    await assets.resolve(model);

    expect(boulders.map((mesh) => mesh.count)).toEqual(counts);
    expect(boulders.map((mesh, index) => mesh.geometry === oldGeometries[index])).toEqual([
      false,
      false,
    ]);
    expect(oldDisposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    expect(assets.releasedModels).toEqual([ROCKS_MODEL]);
    environment.dispose();
  });

  it('releases boulders that arrive after jungle disposal without swapping them', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const environment = jungle();
    environment.init(ctx);
    for (let i = 0; i < 3; i++) {
      await assets.reject();
    }
    const boulder = instanced(ctx, 'boulder-0');
    const oldGeometry = boulder.geometry;

    environment.dispose();
    const model = new Group();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    mesh.name = 'boulder-0';
    model.add(mesh);
    await assets.resolve(model);

    expect(boulder.geometry).toBe(oldGeometry);
    expect(assets.releasedModels).toContain(ROCKS_MODEL);
  });

  it('builds the boardwalk, the steps and the cliff, and disposes them with the jungle', () => {
    const ctx = stubContext();
    const environment = jungle();
    environment.init(ctx);
    for (const name of ['boardwalk', 'commit-steps', 'commit-steps-inlay', 'cliff']) {
      expect(ctx.scene.getObjectByName(name), name).toBeDefined();
    }

    environment.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('puts the exhibit on the glade where the layout has it, facing south down the axis', () => {
    const environment = jungle();
    const [exhibit] = environment.anchors(1);

    expect(exhibit.position).toEqual([EXHIBIT.x, 0, EXHIBIT.z]);
    expect(exhibit.rotationY).toBe(EXHIBIT.yaw);
    // Room for the easel and a visitor either side of it.
    for (const offset of [0, 2.5, -2.5]) {
      expect(
        clearance(EXHIBIT.x + offset, EXHIBIT.z, environment.colliders),
        `${offset} m beside the exhibit`,
      ).toBeGreaterThanOrEqual(2);
    }
    // And room at the spare spots, for a world with more exhibits.
    for (const anchor of environment.anchors(4).slice(1)) {
      const [x, , z] = anchor.position;
      expect(clearance(x, z, environment.colliders), `spare at ${x}, ${z}`).toBeGreaterThan(2);
      expect(inBowl(x, z)).toBe(true);
    }
  });

  it('lays the shared toys out at the layout’s spots, with the steps in the ridge’s place', () => {
    const layout = jungle().toyLayout();

    expect(layout.ridge).toBeUndefined();
    expect([layout.terminal.position.x, layout.terminal.position.z]).toEqual([STELE.x, STELE.z]);
    expect(layout.terminal.rotationY).toBe(STELE.yaw);
    expect([layout.lever?.position.x, layout.lever?.position.z]).toEqual([LIANA.x, LIANA.z]);
    expect(layout.languages.stalks?.map(({ x, z }) => ({ x, z }))).toEqual(
      BAMBOO.map(({ x, z }) => ({ x, z })),
    );
    // The cairns stand `MARKER_OFFSET` behind the line they are laid along, on the cairn's spot.
    const line = layout.releases.from.clone().lerp(layout.releases.to, 0.5);
    expect(Math.hypot(line.x - CAIRN.x, line.z - CAIRN.z)).toBeCloseTo(MARKER_OFFSET, 6);
    const stars = layout.stars.from.clone().lerp(layout.stars.to, 0.5);
    expect([stars.x, stars.z]).toEqual([FIREFLY_GLADE.x, FIREFLY_GLADE.z]);
  });

  it('stands the arriving player at the portal on the ledge, looking north', () => {
    const environment = jungle();

    expect(environment.spawn.x).toBe(PORTAL.x);
    expect(environment.spawn.z).toBe(PORTAL.z);
    expect(environment.spawn.y).toBeCloseTo(3, 1);
    // Forward is (−sin yaw, −cos yaw): north, along the axis.
    expect(-Math.sin(environment.spawnYaw)).toBeCloseTo(0, 10);
    expect(-Math.cos(environment.spawnYaw)).toBeCloseTo(-1, 10);
  });

  it('keeps the arrival open ahead of the portal', () => {
    const environment = jungle();
    expect(clearance(PORTAL.x, PORTAL.z, environment.colliders)).toBeGreaterThan(PLAYER_RADIUS);
    expect(clearance(PORTAL.x, PORTAL.z - 1.5, environment.colliders)).toBeGreaterThan(1.5);
  });

  it('stands the return portal in a niche behind the arrival, facing north over it', () => {
    const environment = jungle();
    const portal = environment.returnPortal;

    // `SPAWN_DISTANCE` behind the arrival, so a visitor steps out of it onto the portal's spot.
    expect(portal.position[0]).toBe(PORTAL.x);
    expect(portal.position[2]).toBeCloseTo(PORTAL.z + SPAWN_DISTANCE, 10);
    // A prop's front is (sin yaw, cos yaw): north, over the arrival.
    expect(Math.sin(portal.rotationY)).toBeCloseTo(0, 10);
    expect(Math.cos(portal.rotationY)).toBeCloseTo(-1, 10);
    // Its back is not in the bowl: the niche it stands in is cut into the rim.
    expect(inBowl(portal.position[0], portal.position[2])).toBe(false);
    expect(inNiche(portal.position[0], portal.position[2])).toBe(true);
  });

  it('keeps the ledge flat and open behind the arrival for the camera’s whole boom', () => {
    const environment = jungle();
    for (let back = 0; back <= BOOM_LENGTH + BOOM_RADIUS; back += 0.1) {
      const z = PORTAL.z + back;
      expect(clearance(PORTAL.x, z, environment.colliders), `at ${z}`).toBeGreaterThan(BOOM_RADIUS);
      // Level with the ledge, so the camera hangs at the shoulder rather than over the rim.
      for (const x of [-1.5, 0, 1.5]) {
        expect(jungleHeightAt(x, z), `at ${x}, ${z}`).toBeCloseTo(3, 0);
      }
    }
  });

  it('holds water in the plunge pool, and keeps the visitor out of it', () => {
    const environment = jungle();
    expect(jungleHeightAt(POOL.x, POOL.z)).toBeCloseTo(POOL_LEVEL - POOL_DEPTH, 6);
    expect(blocked(POOL.x, POOL.z, environment.colliders)).toBe(true);
    expect(blocked(POOL.x + POOL.rx * 0.7, POOL.z, environment.colliders)).toBe(true);
  });

  it('rises the rim high enough all round to hide the floor’s edge', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const x = Math.cos(angle) * (BOWL.rx + 8);
      const z = Math.sin(angle) * (BOWL.rz + 8);
      expect(jungleHeightAt(x, z), `at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThan(5);
    }
    expect(jungleHeightAt(0, CLIFF.z - 4)).toBeGreaterThan(CLIFF.height);
  });

  it('stands the same plants in the same places on every visit', () => {
    expect(jungle().colliders).toEqual(jungle().colliders);
  });

  it('scales the foliage to the bowl, never above what the old jungle drew', () => {
    const today = {
      low: { plants: 320, canopy: 40 },
      medium: { plants: 900, canopy: 110 },
      high: { plants: 1400, canopy: 200 },
    };
    const area = Math.PI * BOWL.rx * BOWL.rz;
    for (const tier of ['low', 'medium', 'high'] as const) {
      const ctx = contextAt(tier);
      const environment = jungle();
      environment.init(ctx);

      const plants = instanced(ctx, 'plants');
      const canopy = instanced(ctx, 'canopy');
      expect(plants.count).toBe(FOLIAGE[tier].plants);
      expect(canopy.count).toBe(FOLIAGE[tier].canopy);
      expect(FOLIAGE[tier].plants).toBeLessThanOrEqual(today[tier].plants);
      expect(FOLIAGE[tier].canopy).toBeLessThanOrEqual(today[tier].canopy);
      // One leaf cluster for both: two draw calls for all the foliage.
      expect(canopy.geometry).toBe(plants.geometry);
      environment.dispose();
    }
    // As thick on the ground as along the old trails: some 0.3 plants a square metre on high.
    expect(FOLIAGE.high.plants / area).toBeGreaterThan(0.25);
    expect(FOLIAGE.low.plants).toBeLessThan(FOLIAGE.medium.plants);
    expect(FOLIAGE.medium.plants).toBeLessThan(FOLIAGE.high.plants);
  });

  it('lets the sun shine through the leaves on the medium and high tiers only', () => {
    const translucency = (tier: QualityTier) => {
      const ctx = contextAt(tier);
      const environment = jungle();
      environment.init(ctx);
      const shaders = ['plants', 'canopy'].map((name) =>
        compile(instanced(ctx, name).material as MeshStandardMaterial),
      );
      environment.dispose();
      return shaders.map((shader) =>
        shader.fragmentShader.includes('foliageBacklight')
          ? shader.uniforms['foliageTranslucency'].value
          : 0,
      );
    };

    expect(translucency('low')).toEqual([0, 0]);
    expect(translucency('medium')).toEqual([0.7, 0.7]);
    expect(translucency('high')).toEqual([1.1, 1.1]);
  });

  it('bends the plants away from the visitor but not the canopy overhead', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const [plants, canopy] = ['plants', 'canopy'].map((name) =>
      compile(instanced(ctx, name).material as MeshStandardMaterial),
    );

    expect(plants.uniforms['foliagePush'].value).toBe(1);
    expect(canopy.uniforms['foliagePush'].value).toBe(0);
    expect(plants.uniforms['foliagePlayer']).toBe(environment.shared.playerPosition);
    expect(plants.uniforms['foliageTime']).toBe(environment.shared.time);
    environment.dispose();
  });

  it('keeps the plants off the arrival point, the walked lines, the water and the furniture', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const position = new Vector3();

    for (const [x, , z] of roots(instanced(ctx, 'plants'), position)) {
      expect(
        STAGE_FLOOR.some((zone) => isExcluded(x, z, [zone])),
        `plant at ${x}, ${z}`,
      ).toBe(false);
    }
    environment.dispose();
  });

  it('hangs the canopy 7 to 11 m up, its lowest leaves well above the visitor', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const canopy = instanced(ctx, 'canopy');

    for (const [x, y, z, scale] of roots(canopy, new Vector3())) {
      const above = y - jungleHeightAt(x, z);
      expect(above).toBeGreaterThanOrEqual(7);
      expect(above).toBeLessThanOrEqual(11);
      // Hung upside down, a cluster reaches about 1.3 leaf lengths below its root.
      expect(above - 1.3 * scale).toBeGreaterThanOrEqual(4);
    }
    environment.dispose();
  });

  it('does no foliage work per frame: the shaders read the shared uniforms', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const meshes = [instanced(ctx, 'plants'), instanced(ctx, 'canopy')];
    const versions = meshes.map((mesh) => mesh.instanceMatrix.version);
    const time = environment.shared.time;

    for (let frame = 0; frame < 30; frame++) {
      ctx.player.position.set(frame * 0.1, 0, -5);
      environment.update(1 / 60, ctx);
    }

    expect(meshes.map((mesh) => mesh.instanceMatrix.version)).toEqual(versions);
    expect(environment.shared.time).toBe(time);
    environment.dispose();
  });

  it('adds wet patches on the medium tier and leaf litter on the high tier to the floor', () => {
    const floor = (tier: QualityTier) => {
      const ctx = contextAt(tier);
      const environment = jungle();
      environment.init(ctx);
      const mesh = ctx.scene.getObjectByName('jungle-floor') as Mesh;
      const shader = compile(mesh.material as MeshStandardMaterial);
      environment.dispose();
      return shader.fragmentShader;
    };

    expect(floor('low')).not.toContain('groundWet');
    expect(floor('low')).toContain('dappleFactor');
    expect(floor('medium')).toContain('groundWet');
    expect(floor('medium')).not.toContain('groundLitter');
    expect(floor('high')).toContain('groundLitter');
  });

  it('offsets its shadow lookups by its own normal bias, leaving other worlds alone', () => {
    const ctx = contextAt('high');
    const environment = jungle();
    environment.init(ctx);
    const sun = ctx.scene.getObjectByName('sun') as DirectionalLight;

    expect(sun.shadow.normalBias).toBe(JUNGLE_SHADOW_NORMAL_BIAS);
    environment.dispose();
  });

  it('holds every animation still for visitors who prefer reduced motion', () => {
    const environment = jungle(true);
    const ctx = stubContext();
    environment.init(ctx);

    environment.update(0.5, ctx);

    expect(environment.shared.time.value).toBe(0);
    environment.dispose();
  });

  it('keeps the feed wall and the exhibit on the glade, north of the rill', () => {
    for (const place of [EXHIBIT, WALL]) {
      expect(place.z).toBeLessThan(RILL.centreZ(place.x) - RILL.halfWidth);
      expect(inBowl(place.x, place.z)).toBe(true);
    }
  });

  describe('slop', () => {
    function slopped(cameraZ = PORTAL.z) {
      const ctx = stubContext();
      const environment = jungle();
      environment.init(ctx);
      ctx.camera.position.set(PORTAL.x, 2, cameraZ);
      environment.update(1 / 60, ctx);
      return { ctx, environment, fog: ctx.scene.fog as Fog };
    }
    const hex = (colour: Color) => colour.getHex();
    const mix = (from: number, to: number, t: number) => new Color(from).lerp(new Color(to), t);

    const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

    it('starts fully slopped: the air only lightly tinted, the slop lying on the ground', () => {
      const { ctx, environment, fog } = slopped();

      expect(SLOP_TINT).toBeLessThanOrEqual(0.25);
      expect(environment.slop).toBe(1);
      expect(environment.haze).toBe(1);
      expect(environment.groundHaze.uniforms.uHazeAmount.value).toBe(1);
      expect(hex(fog.color)).toBe(hex(mix(DSCHUNGEL.fog.color, SLOP_AIR.fog.color, SLOP_TINT)));
      expect(fog.near).toBeCloseTo(lerp(DSCHUNGEL.fog.near, SLOP_AIR.fog.near, SLOP_TINT), 10);
      expect(environment.shared.heightFog.value.x).toBeCloseTo(
        lerp(DSCHUNGEL.fog.heightDensity, SLOP_AIR.fog.heightDensity, SLOP_TINT),
        10,
      );
      expect(hex(environment.backdrop.airlight.value)).toBe(hex(fog.color));
      const hemisphere = ctx.scene.getObjectByName('sky-light') as HemisphereLight;
      expect(hex(hemisphere.color)).toBe(
        hex(mix(DSCHUNGEL.hemisphere.sky, SLOP_AIR.hemisphere.sky, SLOP_TINT)),
      );
      const sun = ctx.scene.getObjectByName('sun') as DirectionalLight;
      expect(hex(sun.color)).toBe(hex(mix(DSCHUNGEL.sun.color, SLOP_AIR.sun, SLOP_TINT)));
      environment.dispose();
    });

    it('lerps the tint back to DSCHUNGEL and thins the ground haze as the slop goes', () => {
      const { ctx, environment, fog } = slopped();

      environment.setSlop(0);
      environment.update(1 / 60, ctx);
      expect(hex(fog.color)).toBe(new Color(DSCHUNGEL.fog.color).getHex());
      expect(fog.near).toBe(DSCHUNGEL.fog.near);
      expect(environment.shared.heightFog.value.x).toBe(DSCHUNGEL.fog.heightDensity);
      expect(hex(environment.shared.sunColor.value)).toBe(new Color(DSCHUNGEL.sun.color).getHex());
      const hemisphere = ctx.scene.getObjectByName('sky-light') as HemisphereLight;
      expect(hex(hemisphere.groundColor)).toBe(new Color(DSCHUNGEL.hemisphere.ground).getHex());
      expect(environment.groundHaze.uniforms.uHazeAmount.value).toBe(0);

      environment.setSlop(0.5);
      environment.update(1 / 60, ctx);
      expect(hex(fog.color)).toBe(
        hex(mix(DSCHUNGEL.fog.color, SLOP_AIR.fog.color, 0.5 * SLOP_TINT)),
      );
      expect(environment.groundHaze.uniforms.uHazeAmount.value).toBe(0.5);
      environment.dispose();
    });

    it('sets the ground haze directly, and writes the lantern light where it clears', () => {
      const environment = jungle();

      environment.setGroundHaze(0.3);
      expect(environment.groundHaze.uniforms.uHazeAmount.value).toBe(0.3);
      environment.setHazeLight(-2, 12, 8);
      expect(environment.groundHaze.uniforms.uHazeLight.value.toArray()).toEqual([-2, 12, 8]);
      environment.setHazeLight(-2, 12, 0);
      expect(environment.groundHaze.uniforms.uHazeLight.value.z).toBe(0);
      environment.dispose();
    });

    it('lays the ground haze over every surface the atmosphere reaches, cleared by the ring', () => {
      for (const [tier, steps] of [
        ['low', 4],
        ['medium', 10],
        ['high', 16],
      ] as const) {
        const ctx = contextAt(tier);
        const environment = jungle();
        environment.init(ctx);
        const mesh = ctx.scene.getObjectByName('jungle-floor') as Mesh;
        const shader = compile(mesh.material as MeshStandardMaterial);

        expect(environment.shared.groundHaze).toBe(environment.groundHaze);
        expect(shader.fragmentShader).toContain(`#define HAZE_STEPS ${steps}`);
        expect(shader.uniforms['uHazeClearOrigin']).toBe(environment.clearing.origin);
        expect(shader.uniforms['uHazeClearRadius']).toBe(environment.clearing.radius);
        environment.dispose();
      }
    });

    it('clamps the slop to 0 … 1', () => {
      const environment = jungle();

      environment.setSlop(3);
      expect(environment.slop).toBe(1);
      environment.setSlop(-2);
      expect(environment.slop).toBe(0);
    });

    it('keeps the full slop over the north bank too: the ring clears it, not the camera', () => {
      for (const z of [ARCH.z - DECK.halfLength - 1, ARCH.z, ARCH.z - 15]) {
        const north = slopped(z);
        expect(north.environment.haze).toBe(1);
        expect(hex(north.fog.color)).toBe(
          hex(mix(DSCHUNGEL.fog.color, SLOP_AIR.fog.color, SLOP_TINT)),
        );
        north.environment.dispose();
      }
    });

    it('shares a clearing origin and radius any material can read, starting at the arch', () => {
      const environment = jungle();
      const { origin, radius } = environment.clearing;

      expect(origin.value.toArray()).toEqual([ARCH.x, DECK.height, ARCH.z]);
      expect(radius.value).toBe(0);
      expect(environment.clearing.glow.value).toBe(0);
      radius.value = 12;
      expect(environment.clearing.radius).toBe(radius);
    });

    it('draws the clearing’s edge on the floor from those same uniforms, on every tier', () => {
      for (const tier of ['low', 'high'] as const) {
        const ctx = contextAt(tier);
        const environment = jungle();
        environment.init(ctx);
        const mesh = ctx.scene.getObjectByName('jungle-floor') as Mesh;
        const shader = compile(mesh.material as MeshStandardMaterial);

        expect(shader.uniforms['uClearOrigin']).toBe(environment.clearing.origin);
        expect(shader.uniforms['uClearRadius']).toBe(environment.clearing.radius);
        expect(shader.uniforms['uClearGlow']).toBe(environment.clearing.glow);
        expect(shader.fragmentShader).toContain('uClearGlow > 0.0');
        environment.dispose();
      }
    });
  });
});

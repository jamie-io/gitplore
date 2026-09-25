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
import { Collider, STEP_HEIGHT, floorHeightAt } from '@engine/player/collision';
import {
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { DSCHUNGEL } from './mood';
import {
  CAVE,
  FOLIAGE,
  JUNGLE_SHADOW_NORMAL_BIAS,
  JungleEnvironment,
  NORTH_BANK_HAZE,
  POOL,
  POOL_LEVEL,
  SLOP_AIR,
  STAGE,
  STAGE_FLOOR,
  ROCKS_MODEL,
  jungleHeightAt,
} from './jungle';
import { ARCH_GLOW_MATERIAL, ARCH_MODEL } from './jungle-bridge';
import {
  ARCH,
  BRIDGE,
  BRIDGE_NORTH,
  BROOK,
  EXHIBIT,
  LANTERN_POST,
  NORTH_TRAIL,
  SOUTH_TRAIL,
  SPAWN,
  STREAM,
  WALL_SLOT,
  WATER_LEVEL,
  jungleRelief,
  onSouthBank,
  pointAlong,
  streamCentreZ,
} from './jungle-layout';
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

const original = (x: number, z: number) =>
  1.4 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.55 * Math.sin((x - z) * 0.21);

/** Walks `player` to each waypoint in turn at walking pace; fails the spec where it gets stuck. */
function walk(
  player: PlayerController,
  environment: JungleEnvironment,
  waypoints: readonly Vector3[],
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

describe('JungleEnvironment', () => {
  it('keeps every tree, fern and boulder off the stage', () => {
    // After the cliff and the pool: every disc that is not the brook, the arch or the cave is a
    // trunk or a boulder.
    const environment = jungle();
    const fixed = new Set<Collider>([
      ...environment.bridge.colliders,
      ...environment.cave.colliders,
    ]);
    const groves = environment.colliders
      .slice(4)
      .filter(
        (collider) =>
          collider.kind === 'cylinder' && !fixed.has(collider) && collider.radius !== BROOK.band,
      );

    expect(groves.length).toBeGreaterThan(80);
    for (const collider of groves) {
      if (collider.kind === 'cylinder') {
        expect(isExcluded(collider.x, collider.z, STAGE), `${collider.x}, ${collider.z}`).toBe(
          false,
        );
      }
    }
  });

  it('leaves the waterfall notch open for a walk-through cave', () => {
    const environment = jungle();

    expect(clearance(POOL.x, -49.5, environment.colliders)).toBeGreaterThanOrEqual(0.35);
    expect(clearance(0, -49.5, environment.colliders)).toBeLessThanOrEqual(0);
  });

  it('opens the rock only into the cave, never through the cliff behind it', () => {
    const environment = jungle();
    const inside = { minX: CAVE.x - 1.4, maxX: CAVE.x + 1.4, minZ: CAVE.z - 1.1 };

    // Wherever a body fits between the rock face and the cliff's back, it is standing in the cave.
    for (let x = CAVE.x - 4; x <= CAVE.x + 4; x += 0.1) {
      for (let z = -55.6; z <= -49.6; z += 0.1) {
        if (clearance(x, z, environment.colliders) >= 0.35) {
          expect(x, `a body fits at ${x}, ${z}`).toBeGreaterThan(inside.minX);
          expect(x, `a body fits at ${x}, ${z}`).toBeLessThan(inside.maxX);
          expect(z, `a body fits at ${x}, ${z}`).toBeGreaterThan(inside.minZ);
        }
      }
    }
  });

  it('walks a visitor down the trail, over the bridge and through the waterfall into the cave', () => {
    const environment = jungle();
    const player = arrive(environment);

    walk(player, environment, [...SOUTH_TRAIL.slice(1), ARCH]);
    // On the deck, standing on its planks rather than wading in the stream under it.
    expect(player.position.y).toBeCloseTo(BRIDGE.deckHeight + PLAYER_EYE_HEIGHT, 5);

    // Along the north trail to the pool, round its west side and in through the falling water.
    walk(player, environment, [
      BRIDGE_NORTH,
      ...NORTH_TRAIL.slice(1),
      new Vector3(3.5, 0, -44),
      new Vector3(4, 0, -48.8),
      new Vector3(7.1, 0, -49.05),
      new Vector3(CAVE.x, 0, -49.9),
      new Vector3(CAVE.x, 0, CAVE.z),
    ]);
    expect(environment.interactables).toEqual(environment.cave.interactables);
  });

  it('walks a visitor from the bridge to the exhibit and to the feed wall', () => {
    const environment = jungle();
    const player = arrive(environment);
    walk(player, environment, [...SOUTH_TRAIL.slice(1), BRIDGE_NORTH]);

    const front = (slot: { position: Vector3; yaw: number }, metres: number) =>
      new Vector3(
        slot.position.x + Math.sin(slot.yaw) * metres,
        0,
        slot.position.z + Math.cos(slot.yaw) * metres,
      );
    walk(player, environment, [front(EXHIBIT, 3)]);
    walk(player, environment, [BRIDGE_NORTH, NORTH_TRAIL[1], front(WALL_SLOT, 3)]);
  });

  it('lets no one across the stream but on the bridge', () => {
    const environment = jungle();
    // The deck is a floor, not a wall: without it, the band either side of the stream's line
    // is closed everywhere but the walkway between the bridge's sides.
    const walls = environment.colliders.filter((collider) => collider.top === undefined);
    const walkway = BRIDGE.halfWidth - PLAYER_RADIUS;

    for (let x = -87; x <= 87; x += 0.1) {
      // A body at the walkway's very edge only touches the wall beside it.
      const onDeck = Math.abs(x - BRIDGE.centre.x) < walkway + 0.05;
      for (const dz of [-STREAM.halfWidth, 0, STREAM.halfWidth]) {
        const z = streamCentreZ(x) + dz;
        if (!onDeck) {
          expect(blocked(x, z, walls), `a body fits in the stream at ${x.toFixed(1)}`).toBe(true);
        }
      }
    }
    // The middle of the deck is open, arch and all.
    expect(blocked(BRIDGE.centre.x, ARCH.z, walls)).toBe(false);
    expect(blocked(BRIDGE.centre.x, BRIDGE.centre.z + 3, walls)).toBe(false);
  });

  it('closes the north bank off from the arrival everywhere but the bridge', () => {
    const environment = jungle();
    // Flood the ground a body fits on from the arrival, with the deck taken away. Nothing it
    // reaches may lie across the stream: the brook, the pool, the cliff and the jungle's edge
    // must seal every other way round.
    const cell = 0.5;
    const minX = -92;
    const maxX = 92;
    const minZ = -70;
    const maxZ = 92;
    const columns = Math.round((maxX - minX) / cell) + 1;
    const rows = Math.round((maxZ - minZ) / cell) + 1;
    const deck = {
      kind: 'aabb' as const,
      minX: BRIDGE.centre.x - BRIDGE.halfWidth,
      maxX: BRIDGE.centre.x + BRIDGE.halfWidth,
      minZ: BRIDGE.centre.z - BRIDGE.halfLength,
      maxZ: BRIDGE.centre.z + BRIDGE.halfLength,
    };
    const walls = [...environment.colliders.filter((c) => c.top === undefined), deck];
    const seen = new Uint8Array(columns * rows);
    const index = (x: number, z: number) =>
      Math.round((z - minZ) / cell) * columns + Math.round((x - minX) / cell);
    const queue: number[] = [index(SPAWN.position.x, SPAWN.position.z)];
    seen[queue[0]] = 1;
    let reachedNorth: string | null = null;

    while (queue.length > 0 && reachedNorth === null) {
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
        if (!onSouthBank(x, z)) {
          reachedNorth = `${x}, ${z}`;
        }
        queue.push(r * columns + c);
      }
    }

    expect(reachedNorth).toBe(null);
  });

  it('walks nobody across the stream beside the bridge, jumping or not', () => {
    const environment = jungle();
    for (const x of [BRIDGE.centre.x - 4, BRIDGE.centre.x + 4, -30, 40]) {
      const player = new PlayerController();
      const z = streamCentreZ(x) + 9;
      player.teleport(new Vector3(x, jungleHeightAt(x, z) + PLAYER_EYE_HEIGHT, z));
      player.yaw = 0;
      for (let frame = 0; frame < 60 * 6; frame++) {
        player.update(
          1 / 60,
          { ...NO_INTENT, forward: 1, jump: frame % 30 === 0 },
          environment.ground,
          environment.colliders,
        );
      }
      expect(onSouthBank(player.position.x, player.position.z), `crossed at ${x}`).toBe(true);
    }
  });

  it('cuts the stream below the water line all the way across, with smooth banks', () => {
    const mouth = BROOK.path[BROOK.path.length - 1].x;
    for (let x = -85; x <= 85; x += 2.5) {
      const centre = streamCentreZ(x);
      // Where the brook runs in from the north, its own cut deepens the bank.
      const brook = Math.abs(x - mouth) < BROOK.halfWidth + 2.5;
      expect(jungleHeightAt(x, centre), `bed at ${x}`).toBeLessThan(WATER_LEVEL - 0.8);
      expect(jungleHeightAt(x, centre + STREAM.halfWidth * 0.8)).toBeLessThan(WATER_LEVEL);
      expect(jungleHeightAt(x, centre - STREAM.halfWidth * 0.8)).toBeLessThan(WATER_LEVEL);
      // Where a visitor may stand, the ground is out of the water.
      expect(jungleHeightAt(x, centre + STREAM.band + PLAYER_RADIUS)).toBeGreaterThanOrEqual(
        WATER_LEVEL,
      );
      if (!brook) {
        expect(jungleHeightAt(x, centre - STREAM.band - PLAYER_RADIUS)).toBeGreaterThanOrEqual(
          WATER_LEVEL,
        );
      }
      // No cliffs: the bank climbs less than 0.1 m per 10 cm anywhere across it.
      for (let dz = -16; dz < 16; dz += 0.1) {
        const step = Math.abs(
          jungleHeightAt(x, centre + dz + 0.1) - jungleHeightAt(x, centre + dz),
        );
        expect(step, `bank at ${x}, ${dz}`).toBeLessThan(0.1);
      }
    }
  });

  it('cuts the brook from the pool down into the stream, all of it under water', () => {
    const path = BROOK.path;
    const length = path.slice(1).reduce((sum, point, i) => sum + point.distanceTo(path[i]), 0);
    for (let along = 0; along <= length; along += 1) {
      const point = pointAlong(path, along);
      expect(jungleHeightAt(point.x, point.z), `brook at ${along}`).toBeLessThan(WATER_LEVEL - 0.3);
    }
  });

  it('stands the deck 20 cm over the banks at either end, one easy step up', () => {
    for (const end of [-1, 1]) {
      const z = BRIDGE.centre.z + end * (BRIDGE.halfLength + 0.2);
      for (const x of [-1, 0, 1].map((side) => BRIDGE.centre.x + side * BRIDGE.halfWidth * 0.8)) {
        const bank = jungleHeightAt(x, z);
        expect(BRIDGE.deckHeight - bank).toBeGreaterThan(0);
        expect(BRIDGE.deckHeight - bank).toBeLessThan(STEP_HEIGHT);
      }
    }
    // Over the water, the deck is the floor.
    const environment = jungle();
    expect(
      floorHeightAt(
        BRIDGE.centre.x,
        BRIDGE.centre.z,
        BRIDGE.deckHeight,
        environment.ground,
        environment.colliders,
      ),
    ).toBe(BRIDGE.deckHeight);
    expect(jungleHeightAt(BRIDGE.centre.x, BRIDGE.centre.z)).toBeLessThan(WATER_LEVEL - 0.8);
  });

  it('lays the stream and the brook at the pool’s own water line', () => {
    const ctx = stubContext();
    const environment = jungle();
    environment.init(ctx);
    const water: Mesh[] = [];
    ctx.scene.traverse((object) => {
      if (object instanceof Mesh && object.name === 'water') {
        water.push(object);
      }
    });

    expect(water).toHaveLength(3);
    for (const mesh of water) {
      expect(mesh.position.y).toBe(POOL_LEVEL);
    }
    environment.dispose();
  });

  it('builds the bridge and sets the arch on it, and hands the arch back when it goes', async () => {
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
      BRIDGE.deckHeight,
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

  it('requests and swaps the authored boulders, then releases their model', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const environment = jungle();
    environment.init(ctx);

    expect(assets.requested).toContain(ROCKS_MODEL);
    expect(assets.requested.indexOf(ARCH_MODEL)).toBeLessThan(
      assets.requested.indexOf(ROCKS_MODEL),
    );
    await assets.resolve(new Group());

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
    await assets.resolve(new Group());
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

  it('builds the cave and disposes it with the jungle', () => {
    const ctx = stubContext();
    const environment = jungle();
    environment.init(ctx);
    expect(ctx.scene.getObjectByName('dschungel-wasserfall-hoehle')).toBeDefined();

    environment.dispose();
    expect(ctx.scene.getObjectByName('dschungel-wasserfall-hoehle')).toBeUndefined();
  });

  it('leaves room at every exhibit spot and 6.5 m to either side, where bespoke furniture stands', () => {
    const environment = jungle();

    for (let count = 1; count <= 4; count++) {
      for (const anchor of environment.anchors(count)) {
        const [x, , z] = anchor.position;
        const side = [Math.cos(anchor.rotationY), -Math.sin(anchor.rotationY)];
        for (const offset of [0, 6.5, -6.5]) {
          expect(
            clearance(x + side[0] * offset, z + side[1] * offset, environment.colliders),
            `${offset} m beside the exhibit at ${x.toFixed(1)}, ${z.toFixed(1)}`,
          ).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('puts the exhibit on the north bank where the map has it, turned to the bridge', () => {
    const [exhibit] = jungle().anchors(1);

    expect(exhibit.position).toEqual([EXHIBIT.position.x, 0, EXHIBIT.position.z]);
    expect(exhibit.rotationY).toBe(EXHIBIT.yaw);
    for (const anchor of jungle().anchors(4)) {
      expect(onSouthBank(anchor.position[0], anchor.position[2])).toBe(false);
    }
  });

  it('stands the arriving player at the south trail’s start, facing along it', () => {
    const environment = jungle();

    expect(environment.spawn.x).toBe(SOUTH_TRAIL[0].x);
    expect(environment.spawn.z).toBe(SOUTH_TRAIL[0].z);
    // Forward is (−sin yaw, −cos yaw): towards the trail's first bend.
    const next = SOUTH_TRAIL[1].clone().sub(SOUTH_TRAIL[0]).normalize();
    expect(-Math.sin(environment.spawnYaw)).toBeCloseTo(next.x, 10);
    expect(-Math.cos(environment.spawnYaw)).toBeCloseTo(next.z, 10);
  });

  it('keeps the arrival open', () => {
    expect(
      clearance(SPAWN.position.x, SPAWN.position.z, jungle().colliders),
    ).toBeGreaterThanOrEqual(5);
  });

  it('holds water in the plunge pool', () => {
    expect(jungleHeightAt(POOL.x, POOL.z)).toBeCloseTo(POOL_LEVEL - POOL.depth, 6);
  });

  it('keeps the ground away from the water exactly as it was', () => {
    for (const point of [
      SPAWN.position,
      LANTERN_POST,
      EXHIBIT.position,
      WALL_SLOT.position,
      SOUTH_TRAIL[1],
      SOUTH_TRAIL[2],
    ]) {
      expect(jungleHeightAt(point.x, point.z)).toBe(original(point.x, point.z));
      expect(jungleRelief(point.x, point.z)).toBe(original(point.x, point.z));
    }
  });

  it('stands the same plants in the same places on every visit', () => {
    expect(jungle().colliders).toEqual(jungle().colliders);
  });

  it('stands 320, 900 and 1400 plants and 40, 110 and 200 canopy clusters by tier', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      const ctx = contextAt(tier);
      const environment = jungle();
      environment.init(ctx);

      const plants = instanced(ctx, 'plants');
      const canopy = instanced(ctx, 'canopy');
      expect(plants.count).toBe(FOLIAGE[tier].plants);
      expect(canopy.count).toBe(FOLIAGE[tier].canopy);
      // One leaf cluster for both: two draw calls for all the foliage.
      expect(canopy.geometry).toBe(plants.geometry);
      environment.dispose();
    }
    expect(FOLIAGE.low).toMatchObject({ plants: 320, canopy: 40 });
    expect(FOLIAGE.medium).toMatchObject({ plants: 900, canopy: 110 });
    expect(FOLIAGE.high).toMatchObject({ plants: 1400, canopy: 200 });
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

  it('keeps the plants off the arrival point, the trail and the exhibit arc', () => {
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

  describe('slop', () => {
    function slopped(cameraZ = SPAWN.position.z) {
      const ctx = stubContext();
      const environment = jungle();
      environment.init(ctx);
      ctx.camera.position.set(SPAWN.position.x, 2, cameraZ);
      environment.update(1 / 60, ctx);
      return { ctx, environment, fog: ctx.scene.fog as Fog };
    }
    const hex = (colour: Color) => colour.getHex();
    const mix = (from: number, to: number, t: number) => new Color(from).lerp(new Color(to), t);

    it('starts fully slopped: violet fog, closer and thicker, over the south bank', () => {
      const { ctx, environment, fog } = slopped();

      expect(environment.slop).toBe(1);
      expect(environment.haze).toBe(1);
      expect(hex(fog.color)).toBe(new Color(SLOP_AIR.fog.color).getHex());
      expect(fog.near).toBe(SLOP_AIR.fog.near);
      expect(fog.far).toBe(SLOP_AIR.fog.far);
      expect(environment.shared.heightFog.value.x).toBe(SLOP_AIR.fog.heightDensity);
      expect(hex(environment.backdrop.airlight.value)).toBe(hex(fog.color));
      const hemisphere = ctx.scene.getObjectByName('sky-light') as HemisphereLight;
      expect(hex(hemisphere.color)).toBe(new Color(SLOP_AIR.hemisphere.sky).getHex());
      const sun = ctx.scene.getObjectByName('sun') as DirectionalLight;
      expect(hex(sun.color)).toBe(new Color(SLOP_AIR.sun).getHex());
      environment.dispose();
    });

    it('lerps the fog, the light and the sky back to DSCHUNGEL as the slop goes', () => {
      const { ctx, environment, fog } = slopped();

      environment.setSlop(0);
      environment.update(1 / 60, ctx);
      expect(hex(fog.color)).toBe(new Color(DSCHUNGEL.fog.color).getHex());
      expect(fog.near).toBe(DSCHUNGEL.fog.near);
      expect(environment.shared.heightFog.value.x).toBe(DSCHUNGEL.fog.heightDensity);
      expect(hex(environment.shared.sunColor.value)).toBe(new Color(DSCHUNGEL.sun.color).getHex());
      const hemisphere = ctx.scene.getObjectByName('sky-light') as HemisphereLight;
      expect(hex(hemisphere.groundColor)).toBe(new Color(DSCHUNGEL.hemisphere.ground).getHex());

      environment.setSlop(0.5);
      environment.update(1 / 60, ctx);
      expect(hex(fog.color)).toBe(hex(mix(DSCHUNGEL.fog.color, SLOP_AIR.fog.color, 0.5)));
      expect(environment.shared.heightFog.value.x).toBeCloseTo(
        (DSCHUNGEL.fog.heightDensity + SLOP_AIR.fog.heightDensity) / 2,
        10,
      );
      environment.dispose();
    });

    it('clamps the slop to 0 … 1', () => {
      const environment = jungle();

      environment.setSlop(3);
      expect(environment.slop).toBe(1);
      environment.setSlop(-2);
      expect(environment.slop).toBe(0);
    });

    it('thins the haze over the north bank, across the span of the bridge', () => {
      const north = slopped(BRIDGE_NORTH.z - 1);
      expect(north.environment.haze).toBeCloseTo(NORTH_BANK_HAZE, 10);
      expect(hex(north.fog.color)).toBe(
        hex(mix(DSCHUNGEL.fog.color, SLOP_AIR.fog.color, NORTH_BANK_HAZE)),
      );
      north.environment.dispose();

      const midspan = slopped(BRIDGE.centre.z);
      expect(midspan.environment.haze).toBeGreaterThan(NORTH_BANK_HAZE);
      expect(midspan.environment.haze).toBeLessThan(1);
      midspan.environment.dispose();
    });

    it('shares a clearing origin and radius any material can read, starting at the arch', () => {
      const environment = jungle();
      const { origin, radius } = environment.clearing;

      expect(origin.value.equals(ARCH)).toBe(true);
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

import {
  DirectionalLight,
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
import { NO_INTENT, PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import {
  CAVE,
  FOLIAGE,
  JUNGLE_SHADOW_NORMAL_BIAS,
  JungleEnvironment,
  POOL,
  POOL_LEVEL,
  STAGE,
  STAGE_FLOOR,
  jungleHeightAt,
} from './jungle';
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

describe('JungleEnvironment', () => {
  it('keeps every tree, fern and boulder off the stage', () => {
    // The first four colliders are the rock around the cave and the pool; the cave's walls come last.
    const environment = jungle();
    for (const collider of environment.colliders
      .slice(4)
      .filter((collider) => !environment.cave.colliders.includes(collider))) {
      if (collider.kind !== 'cylinder') {
        throw new Error('expected plant and boulder cylinders after the cliff and the pool');
      }
      expect(isExcluded(collider.x, collider.z, STAGE)).toBe(false);
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

  it('walks a visitor from the arrival point through the waterfall into the cave', () => {
    const environment = jungle();
    const player = new PlayerController();
    player.teleport(environment.spawn.clone().setY(environment.spawn.y + PLAYER_EYE_HEIGHT));
    // Along the rock face between the pool and the cliff, then in through the falling water.
    const waypoints = [
      new Vector3(14, 0, -48.8),
      new Vector3(10.9, 0, -49.05),
      new Vector3(CAVE.x, 0, -49.9),
      new Vector3(CAVE.x, 0, CAVE.z),
    ];
    for (const waypoint of waypoints) {
      for (let frame = 0; frame < 60 * 20; frame++) {
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
        `stuck short of ${waypoint.x}, ${waypoint.z}`,
      ).toBeLessThan(0.2);
    }
    expect(environment.interactables).toEqual(environment.cave.interactables);
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
          ).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('keeps the arrival glade open', () => {
    expect(clearance(0, 0, jungle().colliders)).toBeGreaterThanOrEqual(8);
  });

  it('holds water in the plunge pool', () => {
    expect(jungleHeightAt(POOL.x, POOL.z)).toBeCloseTo(POOL_LEVEL - POOL.depth, 6);
  });

  it('keeps the ground where the visitor and the exhibits stand exactly as it was', () => {
    for (const [x, z] of [
      [0, 0],
      [0, -19],
      [-6.5, -19],
      [20, 10],
    ] as const) {
      expect(jungleHeightAt(x, z)).toBe(original(x, z));
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
});

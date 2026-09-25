import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { PLAYER_RADIUS } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { CAVE_CLIFF_MODEL, CAVE_COLLIDER_NODE, CAVE_FLOOR_NODE, JungleCave } from './jungle-cave';
import { CAVE, CLIFF, STELE } from './jungle-layout';
import { DSCHUNGEL } from './mood';
import { SharedUniforms } from './shaders/shared-uniforms';
import { clearance } from './testing/clearance';

const cave = () => new JungleCave({ shared: new SharedUniforms(DSCHUNGEL) });

describe('JungleCave', () => {
  it('opens the rock only into the cave, through its mouth behind the falls', () => {
    const { colliders } = cave();
    // Inside, from the mouth to the stele and round it.
    for (const z of [CAVE.z1 - 0.2, -21, STELE.z, CAVE.z0 + 0.5]) {
      expect(clearance(0, z, colliders), `at z ${z}`).toBeGreaterThan(PLAYER_RADIUS);
    }
    // The side walls, the back wall and the face either side are rock.
    expect(clearance(CAVE.x0 - 0.3, -21, colliders)).toBeLessThan(0);
    expect(clearance(CAVE.x1 + 0.3, -21, colliders)).toBeLessThan(0);
    expect(clearance(0, CAVE.z0 - 0.3, colliders)).toBeLessThan(0);
    expect(clearance(-8, CLIFF.z - 0.5, colliders)).toBeLessThan(0);
    expect(clearance(8, CLIFF.z - 0.5, colliders)).toBeLessThan(0);
    // In front of the face, the glade is open.
    expect(clearance(-8, CLIFF.z + 0.6, colliders)).toBeGreaterThan(PLAYER_RADIUS);
  });

  it('reaches the whole width of the cliff and past its ends', () => {
    const { colliders } = cave();
    expect(clearance(-CLIFF.width / 2 - 0.5, CLIFF.z - 2, colliders)).toBeLessThan(0);
    expect(clearance(CLIFF.width / 2 + 0.5, CLIFF.z - 2, colliders)).toBeLessThan(0);
  });

  it('builds the procedural rock and asks for the authored cliff', () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = cave();
    target.init(ctx);

    const rock = ctx.scene.getObjectByName('cliff') as Mesh;
    expect(rock).toBeInstanceOf(Mesh);
    rock.geometry.computeBoundingBox();
    const box = rock.geometry.boundingBox!;
    // The rock's face stands at the cliff's line, give or take its facets.
    expect(box.max.z).toBeLessThan(CLIFF.z + 0.5);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(CLIFF.width);
    expect(box.max.y).toBeGreaterThanOrEqual(CLIFF.height);
    expect(assets.requested).toEqual([CAVE_CLIFF_MODEL]);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('swaps in the authored cliff, hides its collider hull and hands it back', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = cave();
    target.init(ctx);
    const model = new Group();
    const rockMaterial = new MeshStandardMaterial();
    const floor = new Mesh(new BoxGeometry(3, 0.1, 3), rockMaterial);
    floor.name = CAVE_FLOOR_NODE;
    const hull = new Mesh(new BoxGeometry(4, 3, 4), rockMaterial);
    hull.name = CAVE_COLLIDER_NODE;
    model.add(floor, hull);

    await assets.resolve(model);

    expect(ctx.scene.getObjectByName('cave-cliff-model')).toBe(model);
    expect(ctx.scene.getObjectByName('cliff')).toBeUndefined();
    expect(hull.visible).toBe(false);
    expect(floor.visible).toBe(true);
    expect(floor.material).not.toBe(rockMaterial);
    expect((floor.material as MeshStandardMaterial).customProgramCacheKey()).toContain(
      'atmosphere',
    );
    expect(model.position.toArray()).toEqual([0, CAVE.floor, CLIFF.z]);

    target.dispose();
    expect(assets.releasedModels).toEqual([CAVE_CLIFF_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('hands back a cliff that arrives after the jungle has gone', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = cave();
    target.init(ctx);
    target.dispose();
    await assets.resolve(new Group());
    expect(assets.releasedModels).toEqual([CAVE_CLIFF_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });
});

import { Box3, Mesh, Vector3 } from 'three';
import { Collider, floorHeightAt, resolveCollisions } from '@engine/player/collision';
import {
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from '@engine/player/player-controller';
import { stubContext } from '@engine/testing/world-context';
import { PlazaEnvironment, houseRow } from './plaza';
import { clearance } from './testing/clearance';

const plaza = (reducedMotion = false) =>
  new PlazaEnvironment({ reducedMotion: () => reducedMotion });

type SteppableBox = Extract<Collider, { kind: 'aabb' }> & { readonly top: number };

function steppableBox(collider: Collider): collider is SteppableBox {
  return collider.kind === 'aabb' && collider.top !== undefined;
}

function walk(
  player: PlayerController,
  environment: PlazaEnvironment,
  seconds: number,
  forward: number,
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    player.update(1 / 60, { ...NO_INTENT, forward }, environment.ground, environment.colliders);
  }
}

function rooftop(environment: PlazaEnvironment): SteppableBox {
  const roofs = environment.colliders.filter(steppableBox);
  const roof = roofs.reduce<typeof roofs[number] | null>(
    (highest, collider) => (!highest || collider.top > highest.top ? collider : highest),
    null,
  );
  if (!roof) {
    throw new Error('Plaza rooftop is missing');
  }
  return roof;
}

describe('PlazaEnvironment', () => {
  it('leaves the arrival point free', () => {
    const environment = plaza();

    expect(
      clearance(environment.spawn.x, environment.spawn.z, environment.colliders),
    ).toBeGreaterThanOrEqual(3);
  });

  it('faces the first exhibit from the moved arrival', () => {
    const environment = plaza();
    const first = environment.anchors(1)[0];
    const expected = Math.atan2(
      environment.spawn.x - first.position[0],
      environment.spawn.z - first.position[2],
    );

    expect(environment.spawnYaw).toBeCloseTo(expected, 5);
  });

  it('leaves room around every exhibit spot', () => {
    const environment = plaza();

    for (let count = 1; count <= 4; count++) {
      for (const anchor of environment.anchors(count)) {
        expect(
          clearance(anchor.position[0], anchor.position[2], environment.colliders),
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('builds the houses around the square, never on it', () => {
    for (const collider of plaza().colliders) {
      if (collider.kind !== 'aabb') {
        continue;
      }
      const outside =
        collider.minX >= 35 || collider.maxX <= -35 || collider.minZ >= 35 || collider.maxZ <= -35;
      expect(outside).toBe(true);
    }
  });

  it('keeps a street open in the middle of every side', () => {
    const colliders = plaza().colliders;

    for (const [x, z] of [
      [0, -40],
      [0, 40],
      [-40, 0],
      [40, 0],
    ] as const) {
      expect(clearance(x, z, colliders)).toBeGreaterThanOrEqual(3);
    }
  });

  it('builds the same town on every visit', () => {
    expect(houseRow('north', 1)).toEqual(houseRow('north', 1));
    expect(plaza().colliders).toEqual(plaza().colliders);
  });

  it('keeps one fixed, reachable rooftop clear of arrival, exhibits and their route', () => {
    const environment = plaza();
    const roof = rooftop(environment);
    const stairs = environment.colliders.filter(
      (collider): collider is SteppableBox => steppableBox(collider) && collider !== roof,
    );
    const centre = new Vector3((roof.minX + roof.maxX) / 2, roof.top, (roof.minZ + roof.maxZ) / 2);
    const exhibit = new Vector3(...environment.anchors(1)[0].position);
    const route = new Vector3().subVectors(exhibit, environment.spawn);
    const toRoof = new Vector3().subVectors(centre, environment.spawn);
    const routeDistance = Math.abs(route.x * toRoof.z - route.z * toRoof.x) / route.length();

    // Seventeen one-metre treads leave room for the controller's radius before `covers()` rises.
    expect(environment.colliders).toHaveLength(111);
    expect(stairs).toHaveLength(17);
    expect(stairs.every((stair) => stair.maxX - stair.minX >= PLAYER_RADIUS * 2 + 1)).toBe(true);
    expect(stairs.every((stair) => stair.maxZ - stair.minZ >= PLAYER_RADIUS * 2 + 0.2)).toBe(true);
    const rising = [...stairs].sort((left, right) => left.top - right.top);
    for (let index = 1; index < rising.length; index++) {
      expect(rising[index - 1].maxZ).toBeCloseTo(rising[index].minZ, 6);
    }
    expect(Math.hypot(centre.x - environment.spawn.x, centre.z - environment.spawn.z)).toBeGreaterThan(
      20,
    );
    expect(Math.hypot(centre.x - exhibit.x, centre.z - exhibit.z)).toBeGreaterThan(20);
    // T9's ridge, pillars, releases and lanterns sit on this arrival-to-exhibit route.
    expect(routeDistance).toBeGreaterThan(10);
  });

  it('climbs and descends the crates without side-clipping before covers() reaches each tread', () => {
    const environment = plaza();
    const roof = rooftop(environment);
    const player = new PlayerController();
    const stairStart = environment.colliders
      .filter(
        (collider): collider is SteppableBox => steppableBox(collider) && collider !== roof,
      )
      .reduce((lowest, stair) => (stair.top < lowest.top ? stair : lowest));
    player.teleport(
      new Vector3((stairStart.minX + stairStart.maxX) / 2, PLAYER_EYE_HEIGHT, stairStart.minZ - 0.5),
      Math.PI,
    );

    walk(player, environment, 8, 1);

    expect(player.position.x).toBeCloseTo((roof.minX + roof.maxX) / 2, 2);
    expect(player.position.y).toBeCloseTo(roof.top + PLAYER_EYE_HEIGHT, 2);

    player.yaw = 0;
    walk(player, environment, 8, 1);

    expect(player.position.z).toBeLessThan(stairStart.minZ);
    expect(player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 2);
  });

  it('keeps a one-frame 0.35 m rooftop-edge shove on a guard or the descending tread', () => {
    const environment = plaza();
    const roof = rooftop(environment);
    const guard = 0.3 + PLAYER_RADIUS;
    const feet = roof.top;

    for (const [x, z] of [
      [roof.minX + guard - 0.35, (roof.minZ + roof.maxZ) / 2],
      [roof.maxX - guard + 0.35, (roof.minZ + roof.maxZ) / 2],
      [(roof.minX + roof.maxX) / 2, roof.maxZ - guard + 0.35],
    ]) {
      const safe = resolveCollisions(x, z, PLAYER_RADIUS, environment.colliders, feet);
      expect(safe.x).toBeGreaterThanOrEqual(roof.minX);
      expect(safe.x).toBeLessThanOrEqual(roof.maxX);
      expect(safe.z).toBeGreaterThanOrEqual(roof.minZ);
      expect(safe.z).toBeLessThanOrEqual(roof.maxZ);
    }

    const down = floorHeightAt(
      (roof.minX + roof.maxX) / 2 + 0.35,
      roof.minZ - 0.35,
      feet,
      environment.ground,
      environment.colliders,
    );
    expect(down).toBeGreaterThanOrEqual(roof.top - 0.45);
  });

  it('disposes rooftop geometry with the Plaza', () => {
    const environment = plaza();
    const ctx = stubContext();

    environment.init(ctx);
    expect(ctx.scene.getObjectByName('plaza-rooftop')).toBeDefined();
    const stairs = ctx.scene.getObjectByName('plaza-rooftop-stairs');
    expect(stairs).toBeInstanceOf(Mesh);
    if (stairs instanceof Mesh) {
      const bounds = new Box3().setFromObject(stairs);
      expect(bounds.min.y).toBeCloseTo(0, 6);
    }

    environment.dispose();

    expect(ctx.scene.getObjectByName('plaza-rooftop')).toBeUndefined();
    expect(ctx.scene.getObjectByName('plaza-rooftop-stairs')).toBeUndefined();
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

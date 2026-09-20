import { stubContext } from '@engine/testing/world-context';
import { PlazaEnvironment, houseRow } from './plaza';
import { clearance } from './testing/clearance';

const plaza = (reducedMotion = false) =>
  new PlazaEnvironment({ reducedMotion: () => reducedMotion });

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

  it('holds the fountain and everything else still under reduced motion', () => {
    const environment = plaza(true);
    const ctx = stubContext();
    environment.init(ctx);

    environment.update(0.5, ctx);

    expect(environment.shared.time.value).toBe(0);
    environment.dispose();
  });
});

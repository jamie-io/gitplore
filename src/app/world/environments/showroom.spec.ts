import { Mesh, Vector3 } from 'three';
import { resolveCollisions } from '@engine/player/collision';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { HALF, INTERIOR_CEILING, ShowroomEnvironment } from './showroom';
import { ProjectScene } from '../project/project.scene';

const showroom = (reducedMotion = false) =>
  new ShowroomEnvironment({ reducedMotion: () => reducedMotion });

describe('ShowroomEnvironment', () => {
  it('places a reachable door and back room clear of the hall arrival and exhibit row', () => {
    const environment = showroom();
    const interactables = (environment as unknown as {
      readonly interactables: readonly { readonly id: string }[];
    }).interactables;

    expect(interactables).toHaveLength(2);
    expect(interactables[0].id).toBe('showroom:back-room-door:open');
    expect(interactables[1].id).toBe('showroom:back-room:enter');
    expect(environment.colliders).toHaveLength(10);

    const door = (environment as unknown as {
      readonly door: { readonly position: Vector3 };
    }).door;
    const room = (environment as unknown as {
      readonly backRoom: { readonly position: Vector3; readonly colliders: readonly unknown[] };
    }).backRoom;
    expect(door.position.z).toBeLessThan(-23);
    expect(room.position.z).toBeLessThan(door.position.z - 1);
    expect(Math.hypot(room.position.x, room.position.z - 8)).toBeGreaterThan(8);
    expect(room.colliders).toHaveLength(3);
  });

  it('closes the wall above the door with a lintel and matching closed-state collider', () => {
    const ctx = stubContext();
    const environment = showroom();

    environment.init(ctx);

    const lintel = ctx.scene.getObjectByName('showroom:back-room-lintel');
    expect(lintel).toBeInstanceOf(Mesh);
    expect(lintel?.position.y).toBeCloseTo(4.6, 5);
    expect(
      environment.colliders.some(
        (collider) =>
          collider.kind === 'aabb' &&
          collider.minX === 15 &&
          collider.maxX === 17 &&
          collider.minZ === -24.8 &&
          collider.maxZ === -24,
      ),
    ).toBe(true);

    environment.dispose();
  });

  it('keeps route closed until door opens, then lets visitor reach room', () => {
    const ctx = stubContext();
    const environment = showroom();
    environment.init(ctx);

    expect(resolveCollisions(16, -24.5, 0.35, environment.colliders, -Infinity).z).toBeLessThan(
      -24.5,
    );

    ctx.player.teleport(new Vector3(16, 1.7, -23.3), 0);
    environment.update(0, ctx);

    expect(environment.door.open).toBe(true);
    expect(resolveCollisions(16, -24.5, 0.35, environment.colliders, -Infinity)).toEqual({
      x: 16,
      z: -24.5,
    });

    environment.dispose();
  });

  it('keeps back room clear of exhibit, portal, path and repository data objects', () => {
    const environment = showroom(true);
    const scene = new ProjectScene({
      environment,
      project: PROJECT_FIXTURES[0],
      reducedMotion: () => true,
      onOpenInfo: () => undefined,
      onLeave: () => undefined,
    });
    const room = environment.backRoom.position;
    const projectColliders = scene.colliders.slice(environment.colliders.length);

    for (const collider of projectColliders) {
      const distance =
        collider.kind === 'cylinder'
          ? Math.hypot(room.x - collider.x, room.z - collider.z) - collider.radius
          : Math.max(collider.minX - room.x, 0, room.x - collider.maxX) +
            Math.max(collider.minZ - room.z, 0, room.z - collider.maxZ);
      expect(distance).toBeGreaterThan(2);
    }
  });

  it('disposes its door and back room with the environment', () => {
    const ctx = stubContext();
    const environment = showroom();

    environment.init(ctx);
    environment.dispose();

    expect(ctx.scene.getObjectByName('showroom:back-room-door')).toBeUndefined();
    expect(ctx.scene.getObjectByName('showroom:back-room')).toBeUndefined();
  });

  it('blocks only its four walls, so the bespoke scenes own the floor', () => {
    const colliders = showroom().colliders;

    expect(colliders.length).toBe(10);
    expect(colliders.every((collider) => collider.kind === 'aabb')).toBe(true);
  });

  it('builds nothing inside the hall below the ceiling zone, apart from what lies on the floor', () => {
    const ctx = stubContext();
    const environment = showroom();
    environment.init(ctx);
    const vertex = new Vector3();

    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse((object) => {
      if (!(object instanceof Mesh) || object.name === 'showroom-floor') {
        return;
      }
      const position = object.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        const againstWall =
          Math.abs(vertex.x) >= HALF - 0.4 - 1e-6 || Math.abs(vertex.z) >= HALF - 0.4 - 1e-6;
        const overhead = vertex.y >= INTERIOR_CEILING;
        const onFloor = vertex.y <= 0.02;
        expect(againstWall || overhead || onFloor).toBe(true);
      }
    });

    environment.dispose();
  });

  it('places pilasters on the hall-facing side of all four walls', () => {
    const ctx = stubContext();
    const environment = showroom();
    environment.init(ctx);

    const trim = ctx.scene.getObjectByName('trim');
    expect(trim).toBeInstanceOf(Mesh);
    if (!(trim instanceof Mesh)) {
      environment.dispose();
      return;
    }

    const position = trim.geometry.getAttribute('position');
    const vertices = Array.from({ length: position.count }, (_, index) =>
      new Vector3().fromBufferAttribute(position, index),
    );
    const wallFace = HALF - 0.4;
    const pilasterDepth = 0.12;
    const isOnHallSide = (coordinate: number, side: -1 | 1) => {
      const face = side * wallFace;
      return side === 1
        ? coordinate >= face - pilasterDepth - 1e-6 && coordinate <= face + 1e-6
        : coordinate >= face - 1e-6 && coordinate <= face + pilasterDepth + 1e-6;
    };

    for (const [axis, side] of [
      ['x', -1],
      ['x', 1],
      ['z', -1],
      ['z', 1],
    ] as const) {
      expect(
        vertices.some((vertex) => isOnHallSide(axis === 'x' ? vertex.x : vertex.z, side as -1 | 1)),
      ).toBe(true);
    }

    environment.dispose();
  });

  it('closes the hall with a ceiling', () => {
    const ctx = stubContext();
    const environment = showroom();
    environment.init(ctx);

    expect(ctx.scene.getObjectByName('ceiling')).toBeDefined();
    environment.dispose();
  });

  it('holds time still for visitors who prefer reduced motion', () => {
    const ctx = stubContext();
    const environment = showroom(true);
    environment.init(ctx);

    environment.update(1, ctx);

    expect(environment.shared.time.value).toBe(0);
    environment.dispose();
  });
});

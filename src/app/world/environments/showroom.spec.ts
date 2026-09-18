import { Mesh, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { HALF, INTERIOR_CEILING, ShowroomEnvironment } from './showroom';

const showroom = (reducedMotion = false) =>
  new ShowroomEnvironment({ reducedMotion: () => reducedMotion });

describe('ShowroomEnvironment', () => {
  it('blocks only its four walls, so the bespoke scenes own the floor', () => {
    const colliders = showroom().colliders;

    expect(colliders.length).toBe(4);
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

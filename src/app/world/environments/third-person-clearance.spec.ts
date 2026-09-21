import { PerspectiveCamera, Texture, Vector3 } from 'three';
import { Collider, HeightField, resolveCollisions } from '@engine/player/collision';
import {
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from '@engine/player/player-controller';
import { BOOM_LENGTH, BOOM_RADIUS, ThirdPersonRig } from '@engine/player/third-person-rig';
import { HubScene } from '../hub/hub.scene';
import { ClearingEnvironment } from './clearing';
import { PlazaEnvironment } from './plaza';
import { HALF, ShowroomEnvironment } from './showroom';
import { clearance } from './testing/clearance';

/**
 * The third-person boom against the two worlds that can swallow it: the Plaza, whose houses stand
 * shoulder to shoulder around the square, and the Showroom, which is a closed box. The rig's own
 * spec proves the marching; this one proves it holds over every spot a visitor can stand in and
 * every direction they can look, against the collider layouts those worlds really build.
 */

const YAWS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
/** Level, well down and well up: pitch both shortens the boom's reach and swings its height. */
const PITCHES = [0, -0.7, 0.7];
/**
 * Metres between sampled spots. Finer than the 10 m streets between the Plaza's house rows, and a
 * spot that lands inside a house comes back pressed against its wall, so the awkward places — the
 * ones with a facade right behind the visitor — are sampled densely whatever the step.
 */
const STEP = 2.5;

interface Sweep {
  /** The smallest gap between the camera and any collider over the poses that count. */
  room: number;
  at: string;
  /** Poses that counted towards `room`. */
  measured: number;
  /** Poses where something behind the visitor shortened the boom. */
  reeled: number;
  /** Poses left out of `room` because the boom ran exactly along a facade; see `GRAZE` below. */
  grazed: number;
}

/**
 * A camera exactly in the plane of a facade, and nothing else, measures exactly zero. The march
 * genuinely allows it: `resolveCollisions` returns a point on a box's face unchanged, so a boom
 * running along that plane never reels in. It is not inside the house — the signed `clearance`
 * would say so with a negative number — and no walking visitor reaches it, because it needs a
 * coordinate to match a facade's to the last bit. Only an axis-aligned grid laid over an
 * axis-aligned town produces one, so those poses are counted apart rather than allowed to drag
 * the assertion down to "not inside".
 */
const GRAZE = 0;

function sweep(colliders: readonly Collider[], ground: HeightField, extent: number): Sweep {
  const camera = new PerspectiveCamera();
  const rig = new ThirdPersonRig(camera);
  const player = new PlayerController();
  const head = new Vector3();
  const result: Sweep = { room: Infinity, at: 'nowhere', measured: 0, reeled: 0, grazed: 0 };

  for (let x = -extent; x <= extent; x += STEP) {
    for (let z = -extent; z <= extent; z += STEP) {
      // Where a visitor aiming for (x, z) would actually end up. `resolveCollisions` pushes out of
      // one collider at a time, so a spot squeezed out of one house can land inside its neighbour;
      // anything not strictly outside everything is not a spot a visitor stands in, and not the
      // rig's problem. A spot that did resolve stands a whole `PLAYER_RADIUS` clear.
      const stand = resolveCollisions(x, z, PLAYER_RADIUS, colliders, -Infinity);
      if (clearance(stand.x, stand.z, colliders) <= 0) {
        continue;
      }
      head.set(stand.x, ground.heightAt(stand.x, stand.z) + PLAYER_EYE_HEIGHT, stand.z);

      for (const yaw of YAWS) {
        for (const pitch of PITCHES) {
          player.teleport(head, yaw, pitch);
          // Reduced motion, so this measures the boom's geometry and not its easing.
          rig.sync(player, { dt: 1 / 60, ground, colliders, reducedMotion: true });

          // Pitch is what the ground clamp acts on, so the reach is measured flat.
          const reach = Math.hypot(camera.position.x - stand.x, camera.position.z - stand.z);
          if (reach < BOOM_LENGTH * Math.cos(pitch) - 1e-6) {
            result.reeled++;
          }

          const room = clearance(
            camera.position.x,
            camera.position.z,
            colliders,
            camera.position.y,
          );
          if (room === GRAZE) {
            result.grazed++;
            continue;
          }

          result.measured++;
          if (room < result.room) {
            result.room = room;
            result.at = `(${stand.x.toFixed(1)}, ${stand.z.toFixed(1)}) yaw ${yaw.toFixed(2)} pitch ${pitch}`;
          }
        }
      }
    }
  }

  return result;
}

/** How far the furthest collider reaches from the middle of the world. */
function extentOf(colliders: readonly Collider[]): number {
  return Math.max(
    ...colliders.map((collider) =>
      collider.kind === 'cylinder'
        ? Math.hypot(collider.x, collider.z) + collider.radius
        : Math.max(
            Math.abs(collider.minX),
            Math.abs(collider.maxX),
            Math.abs(collider.minZ),
            Math.abs(collider.maxZ),
          ),
    ),
  );
}

/**
 * The camera kept its own width from everything it could have been inside. A margin rather than
 * "not negative": an unsigned distance cannot tell being inside a wall from being against one, and
 * the regression this sweep exists to catch — a march that keeps the blocked sample instead of the
 * last clear one — lands the camera well inside, where a mere "outside" test would still pass.
 */
function expectClear(swept: Sweep): void {
  expect(swept.room, `closest at ${swept.at}`).toBeGreaterThanOrEqual(BOOM_RADIUS - 1e-9);
  // The exemption is an artefact of the grid, not a licence: almost every pose must be measured.
  expect(swept.measured).toBeGreaterThan(swept.grazed * 100);
}

describe('the third-person boom in the furnished worlds', () => {
  it('never ends up inside a house on the Plaza', () => {
    const plaza = new PlazaEnvironment({ reducedMotion: () => false });

    const swept = sweep(plaza.colliders, plaza.ground, extentOf(plaza.colliders));

    expectClear(swept);
    // Not a test that passes by never meeting a house: the square is ringed with them.
    expect(swept.reeled).toBeGreaterThan(1000);
  });

  it('never ends up inside the camp at the Lichtung spawn', () => {
    const scene = new HubScene({
      environment: new ClearingEnvironment({ reducedMotion: () => false }),
      reducedMotion: () => false,
      projects: [],
      onEnter: () => undefined,
      onContact: () => undefined,
      textures: { load: () => new Texture(), release: () => undefined },
    });

    // The camp and the monument behind it; the groves stand far beyond this square.
    const swept = sweep(scene.colliders, scene.ground, 11);

    expectClear(swept);
    // The fire, the boards and the obelisk really do get in the camera's way somewhere.
    expect(swept.reeled).toBeGreaterThan(100);
  });

  it('never ends up inside a Showroom wall', () => {
    const showroom = new ShowroomEnvironment({ reducedMotion: () => false });

    // The hall is closed, so only the floor inside the walls is ever stood on.
    const swept = sweep(showroom.colliders, showroom.ground, HALF - 1);

    expectClear(swept);
    expect(swept.reeled).toBeGreaterThan(500);
  });
});

describe('height-aware third-person clearance', () => {
  it('ignores a low steppable top at camera height but keeps walls solid', () => {
    const crate: Collider = { kind: 'aabb', minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 0.5 };
    const wall: Collider = { kind: 'aabb', minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

    expect(clearance(0, 0, [crate], 0.5)).toBe(Infinity);
    expect(clearance(0, 0, [crate], 0.49)).toBeLessThan(0);
    expect(clearance(0, 0, [wall], 10)).toBeLessThan(0);
  });
});

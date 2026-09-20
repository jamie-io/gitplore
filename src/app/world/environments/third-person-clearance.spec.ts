import { PerspectiveCamera, Vector3 } from 'three';
import { Collider, HeightField, resolveCollisions } from '@engine/player/collision';
import {
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from '@engine/player/player-controller';
import { BOOM_LENGTH, ThirdPersonRig } from '@engine/player/third-person-rig';
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
  /** The smallest gap between the camera and any collider; negative means inside one. */
  room: number;
  at: string;
  /** Poses where something behind the visitor shortened the boom. */
  reeled: number;
}

function sweep(colliders: readonly Collider[], ground: HeightField, extent: number): Sweep {
  const camera = new PerspectiveCamera();
  const rig = new ThirdPersonRig(camera);
  const player = new PlayerController();
  const head = new Vector3();
  const result: Sweep = { room: Infinity, at: 'nowhere', reeled: 0 };

  for (let x = -extent; x <= extent; x += STEP) {
    for (let z = -extent; z <= extent; z += STEP) {
      // Where a visitor aiming for (x, z) would actually end up. Wedged between two props they
      // could not stand at all, so those spots are not the rig's problem.
      const stand = resolveCollisions(x, z, PLAYER_RADIUS, colliders, -Infinity);
      if (clearance(stand.x, stand.z, colliders) < 0) {
        continue;
      }
      head.set(stand.x, ground.heightAt(stand.x, stand.z) + PLAYER_EYE_HEIGHT, stand.z);

      for (const yaw of YAWS) {
        for (const pitch of PITCHES) {
          player.teleport(head, yaw, pitch);
          // Reduced motion, so this measures the boom's geometry and not its easing.
          rig.sync(player, { dt: 1 / 60, ground, colliders, reducedMotion: true });

          const room = clearance(camera.position.x, camera.position.z, colliders);
          if (room < result.room) {
            result.room = room;
            result.at = `(${stand.x.toFixed(1)}, ${stand.z.toFixed(1)}) yaw ${yaw.toFixed(2)} pitch ${pitch}`;
          }
          // Pitch is what the ground clamp acts on, so the reach is measured flat.
          const reach = Math.hypot(camera.position.x - stand.x, camera.position.z - stand.z);
          if (reach < BOOM_LENGTH * Math.cos(pitch) - 1e-6) {
            result.reeled++;
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

describe('the third-person boom in the furnished worlds', () => {
  it('never ends up inside a house on the Plaza', () => {
    const plaza = new PlazaEnvironment({ reducedMotion: () => false });

    const swept = sweep(plaza.colliders, plaza.ground, extentOf(plaza.colliders));

    // Not greater than zero: a sample landing exactly on an axis-aligned facade puts the camera
    // exactly on its plane, which the shared containment maths counts as outside the house — and
    // which is exactly what it is. Everywhere else the boom keeps its own width from the wall.
    expect(swept.room, `closest at ${swept.at}`).toBeGreaterThanOrEqual(0);
    // Not a test that passes by never meeting a house: the square is ringed with them.
    expect(swept.reeled).toBeGreaterThan(1000);
  });

  it('never ends up inside a Showroom wall', () => {
    const showroom = new ShowroomEnvironment({ reducedMotion: () => false });

    // The hall is closed, so only the floor inside the walls is ever stood on.
    const swept = sweep(showroom.colliders, showroom.ground, HALF - 1);

    expect(swept.room, `closest at ${swept.at}`).toBeGreaterThanOrEqual(0);
    expect(swept.reeled).toBeGreaterThan(500);
  });
});

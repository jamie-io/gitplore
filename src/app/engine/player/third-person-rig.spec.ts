import { PerspectiveCamera, Vector3 } from 'three';
import { RigFrame } from './camera-rig';
import { Collider, HeightField } from './collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from './player-controller';
import {
  BOOM_HEIGHT,
  BOOM_LENGTH,
  GROUND_CLEARANCE,
  MAX_RISE_LAG,
  ThirdPersonRig,
} from './third-person-rig';

const FLAT: HeightField = { heightAt: () => 0 };

/** Reduced motion by default, so a test about geometry is not also a test about easing. */
function frame(overrides: Partial<RigFrame> = {}): RigFrame {
  return { dt: 1 / 60, ground: FLAT, colliders: [], reducedMotion: true, ...overrides };
}

function standing(at = new Vector3(0, PLAYER_EYE_HEIGHT, 0)): PlayerController {
  const player = new PlayerController();
  player.teleport(at);
  return player;
}

/** A wall from `z` to `z + depth`, straight behind a player facing yaw 0. */
function wall(z: number, depth: number, top?: number): Collider {
  return { kind: 'aabb', minX: -5, maxX: 5, minZ: z, maxZ: z + depth, top };
}

describe('ThirdPersonRig', () => {
  it('hangs the camera a boom behind the head and a little above it', () => {
    const camera = new PerspectiveCamera();
    const player = standing();

    new ThirdPersonRig(camera).sync(player, frame());

    expect(camera.position.x).toBeCloseTo(0, 6);
    expect(camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT + BOOM_HEIGHT, 6);
    expect(camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
  });

  it('swings the boom round with the yaw, keeping it behind the player', () => {
    const camera = new PerspectiveCamera();
    const player = standing();
    player.yaw = Math.PI / 2;

    new ThirdPersonRig(camera).sync(player, frame());

    // Forward is −X at this yaw, so behind is +X.
    expect(camera.position.x).toBeCloseTo(BOOM_LENGTH, 6);
    expect(camera.position.z).toBeCloseTo(0, 6);
  });

  it('orbits the boom on pitch instead of tilting the head', () => {
    const camera = new PerspectiveCamera();
    const player = standing();
    player.pitch = -Math.PI / 2;

    new ThirdPersonRig(camera).sync(player, frame());

    // Looking straight down puts the camera straight overhead, still looking at the head.
    expect(camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT + BOOM_HEIGHT + BOOM_LENGTH, 6);
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeCloseTo(0, 6);
  });

  it('takes the aim straight from the player, yaw before pitch', () => {
    const camera = new PerspectiveCamera();
    const player = standing();
    player.yaw = 0.8;
    player.pitch = -0.4;

    new ThirdPersonRig(camera).sync(player, frame());

    expect(camera.rotation.order).toBe('YXZ');
    expect(camera.rotation.y).toBeCloseTo(0.8, 6);
    expect(camera.rotation.x).toBeCloseTo(-0.4, 6);
    expect(camera.rotation.z).toBeCloseTo(0, 6);
  });

  it('never lets the boom swing below the ground', () => {
    const camera = new PerspectiveCamera();
    const ground: HeightField = { heightAt: () => 5 };
    const player = standing(new Vector3(0, 5 + PLAYER_EYE_HEIGHT, 0));
    // Looking up drives the boom down; unclamped it would end up at 3.45, below the terrain.
    player.pitch = Math.PI / 2;

    new ThirdPersonRig(camera).sync(player, frame({ ground }));

    expect(camera.position.y).toBeCloseTo(5 + GROUND_CLEARANCE, 6);
  });

  describe('wall avoidance', () => {
    it('reels the boom in to the last sample clear of a wall', () => {
      const camera = new PerspectiveCamera();
      const player = standing();

      new ThirdPersonRig(camera).sync(player, frame({ colliders: [wall(2, 1)] }));

      // Samples land every 0.6 m; 1.8 is already within the camera's own width of the wall.
      expect(camera.position.z).toBeCloseTo(1.2, 6);
    });

    it('leaves the camera on the head when even the first sample is blocked', () => {
      const camera = new PerspectiveCamera();
      const player = standing();

      new ThirdPersonRig(camera).sync(player, frame({ colliders: [wall(0.4, 2)] }));

      expect(camera.position.z).toBeCloseTo(0, 6);
      expect(camera.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT + BOOM_HEIGHT, 6);
    });

    it('ignores a crate the camera stands above, so it does not pull the boom in', () => {
      const camera = new PerspectiveCamera();
      const player = standing();

      new ThirdPersonRig(camera).sync(player, frame({ colliders: [wall(2, 3, 0.5)] }));

      expect(camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('never leaves the camera inside a prop the eased anchor drifted into', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      // A block the player has already walked past, but the trailing anchor has not.
      const block = wall(-0.3, 0.6);
      rig.sync(player, frame({ reducedMotion: false }));

      player.position.z = -1.5;
      rig.sync(player, frame({ reducedMotion: false, colliders: [block] }));

      expect(Math.abs(camera.position.z)).toBeGreaterThanOrEqual(0.3);
    });

    it('still avoids a block whose top stands above the camera', () => {
      const camera = new PerspectiveCamera();
      const player = standing();

      new ThirdPersonRig(camera).sync(player, frame({ colliders: [wall(2, 3, 5)] }));

      expect(camera.position.z).toBeCloseTo(1.2, 6);
    });
  });

  describe('the boom coming back out', () => {
    it('comes in the instant a wall appears, rather than easing through it', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));

      rig.sync(player, frame({ reducedMotion: false, colliders: [wall(2, 1)] }));

      expect(camera.position.z).toBeCloseTo(1.2, 6);
    });

    it('eases back out once the wall is behind it', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      const blocked = frame({ reducedMotion: false, colliders: [wall(2, 1)] });
      rig.sync(player, blocked);
      rig.sync(player, blocked);

      rig.sync(player, frame({ reducedMotion: false }));

      expect(camera.position.z).toBeGreaterThan(1.2);
      expect(camera.position.z).toBeLessThan(BOOM_LENGTH);
    });

    it('is back at full length a moment later', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false, colliders: [wall(2, 1)] }));

      for (let i = 0; i < 60; i++) {
        rig.sync(player, frame({ reducedMotion: false }));
      }

      expect(camera.position.z).toBeCloseTo(BOOM_LENGTH, 3);
    });

    it('takes the boom back out in one frame under reduced motion', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ colliders: [wall(2, 1)] }));

      rig.sync(player, frame());

      expect(camera.position.z).toBeCloseTo(BOOM_LENGTH, 6);
    });

    it('arrives in another world at full length instead of growing into it', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false, colliders: [wall(2, 1)] }));

      player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, -30));
      rig.sync(player, frame({ reducedMotion: false }));

      expect(camera.position.z).toBeCloseTo(-30 + BOOM_LENGTH, 6);
    });
  });

  describe('follow lag', () => {
    it('trails the player instead of snapping to them', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));

      player.position.x = 0.3;
      rig.sync(player, frame({ reducedMotion: false }));

      expect(camera.position.x).toBeGreaterThan(0);
      expect(camera.position.x).toBeLessThan(0.3);
    });

    it('catches up within a handful of frames', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));

      player.position.x = 0.3;
      for (let i = 0; i < 60; i++) {
        rig.sync(player, frame({ reducedMotion: false }));
      }

      expect(camera.position.x).toBeCloseTo(0.3, 3);
    });

    it('drops the lag entirely under reduced motion', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame());

      player.position.x = 0.3;
      rig.sync(player, frame());

      expect(camera.position.x).toBeCloseTo(0.3, 6);
    });

    it('snaps rather than flying across the map when the player is teleported', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));

      player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, -30));
      rig.sync(player, frame({ reducedMotion: false }));

      expect(camera.position.z).toBeCloseTo(-30 + BOOM_LENGTH, 6);
    });
  });

  describe('vertical damping', () => {
    /** The controller raises the eye by a whole step between two frames when a crate is climbed. */
    const stepUp = (player: PlayerController) => {
      player.position.y += MAX_RISE_LAG;
    };

    it('spreads a step up over several frames instead of teleporting the eye', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));
      const before = camera.position.y;

      stepUp(player);
      rig.sync(player, frame({ reducedMotion: false }));

      expect(camera.position.y).toBeGreaterThan(before);
      expect(camera.position.y).toBeLessThan(before + MAX_RISE_LAG / 2);
    });

    it('arrives at the new height once the climb is over', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));
      const before = camera.position.y;

      stepUp(player);
      for (let i = 0; i < 90; i++) {
        rig.sync(player, frame({ reducedMotion: false }));
      }

      expect(camera.position.y).toBeCloseTo(before + MAX_RISE_LAG, 3);
    });

    it('never trails the head by more than one step, however long the fall', () => {
      const camera = new PerspectiveCamera();
      const player = standing(new Vector3(0, 40, 0));
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame({ reducedMotion: false }));

      // 7 m/s of fall, the controller's jump speed, for half a second.
      for (let i = 0; i < 30; i++) {
        player.position.y -= 7 / 60;
        rig.sync(player, frame({ reducedMotion: false }));
      }

      const head = player.position.y + BOOM_HEIGHT;
      expect(Math.abs(camera.position.y - head)).toBeLessThanOrEqual(MAX_RISE_LAG + 1e-9);
    });

    it('takes the step in one frame under reduced motion', () => {
      const camera = new PerspectiveCamera();
      const player = standing();
      const rig = new ThirdPersonRig(camera);
      rig.sync(player, frame());
      const before = camera.position.y;

      stepUp(player);
      rig.sync(player, frame());

      expect(camera.position.y).toBeCloseTo(before + MAX_RISE_LAG, 6);
    });
  });
});

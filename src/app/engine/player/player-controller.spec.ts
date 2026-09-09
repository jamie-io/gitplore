import { Vector3 } from 'three';
import { Collider, HeightField } from './collision';
import {
  MoveIntent,
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
} from './player-controller';

const FLAT: HeightField = { heightAt: () => 0 };
const intent = (partial: Partial<MoveIntent>): MoveIntent => ({ ...NO_INTENT, ...partial });

/** Runs a whole second so gravity and movement both have time to act. */
function simulate(
  player: PlayerController,
  moves: Partial<MoveIntent>,
  { seconds = 1, ground = FLAT, colliders = [] as Collider[] } = {},
) {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) {
    player.update(step, intent(moves), ground, colliders);
  }
  return player.position;
}

function settled(ground: HeightField = FLAT): PlayerController {
  const player = new PlayerController();
  simulate(player, {}, { seconds: 2, ground });
  return player;
}

describe('PlayerController movement', () => {
  it('walks toward -Z when facing straight ahead', () => {
    const position = simulate(settled(), { forward: 1 });

    expect(position.z).toBeLessThan(-1);
    expect(position.x).toBeCloseTo(0, 6);
  });

  it('walks toward +X after turning a quarter turn to the right', () => {
    const player = settled();
    player.update(1 / 60, intent({ yawDelta: Math.PI / 2 }), FLAT, []);

    const position = simulate(player, { forward: 1 });

    expect(position.x).toBeGreaterThan(1);
    expect(position.z).toBeCloseTo(0, 6);
  });

  it('strafes toward +X when facing straight ahead', () => {
    const position = simulate(settled(), { strafe: 1 });

    expect(position.x).toBeGreaterThan(1);
    expect(position.z).toBeCloseTo(0, 6);
  });

  it('does not travel faster diagonally than straight', () => {
    const straight = simulate(settled(), { forward: 1 });
    const straightDistance = Math.hypot(straight.x, straight.z);

    const diagonal = simulate(settled(), { forward: 1, strafe: 1 });

    expect(Math.hypot(diagonal.x, diagonal.z)).toBeLessThanOrEqual(straightDistance + 1e-6);
  });

  it('covers more ground running than walking', () => {
    const walked = Math.abs(simulate(settled(), { forward: 1 }).z);
    const ran = Math.abs(simulate(settled(), { forward: 1, run: true }).z);

    expect(ran).toBeGreaterThan(walked);
  });
});

describe('PlayerController looking around', () => {
  it('turns right when the mouse moves right', () => {
    const player = settled();

    player.update(1 / 60, intent({ yawDelta: 0.5 }), FLAT, []);

    expect(player.yaw).toBeCloseTo(-0.5, 6);
  });

  it('clamps pitch so the view cannot flip over', () => {
    const player = settled();

    for (let i = 0; i < 100; i++) {
      player.update(1 / 60, intent({ pitchDelta: 0.5 }), FLAT, []);
    }

    expect(Math.abs(player.pitch)).toBeLessThan(Math.PI / 2);
  });
});

describe('PlayerController ground handling', () => {
  it('falls onto the terrain and settles at eye height', () => {
    const player = new PlayerController();
    player.teleport(new Vector3(0, 20, 0));

    simulate(player, {}, { seconds: 3 });

    expect(player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 4);
  });

  it('stands on raised ground rather than sinking into it', () => {
    const hill: HeightField = { heightAt: () => 3 };

    const player = settled(hill);

    expect(player.position.y).toBeCloseTo(3 + PLAYER_EYE_HEIGHT, 4);
  });

  it('follows a slope while walking up it', () => {
    const ramp: HeightField = { heightAt: (_x, z) => Math.max(0, -z) * 0.2 };

    const position = simulate(settled(ramp), { forward: 1 }, { ground: ramp });

    expect(position.y).toBeGreaterThan(PLAYER_EYE_HEIGHT + 0.5);
    expect(position.y).toBeCloseTo(Math.max(0, -position.z) * 0.2 + PLAYER_EYE_HEIGHT, 4);
  });

  it('leaves the ground when jumping and comes back down', () => {
    const player = settled();

    player.update(1 / 60, intent({ jump: true }), FLAT, []);
    const airborne = player.position.y;
    simulate(player, {}, { seconds: 3 });

    expect(airborne).toBeGreaterThan(PLAYER_EYE_HEIGHT);
    expect(player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 4);
  });

  it('cannot jump again while already in the air', () => {
    const player = settled();
    player.update(1 / 60, intent({ jump: true }), FLAT, []);
    const firstRise = player.position.y;

    for (let i = 0; i < 5; i++) player.update(1 / 60, intent({ jump: true }), FLAT, []);

    expect(player.position.y).toBeLessThan(firstRise * 6);
  });
});

describe('PlayerController collision', () => {
  it('stops at a pillar instead of walking through it', () => {
    const pillar: Collider = { kind: 'cylinder', x: 0, z: -5, radius: 1 };

    const position = simulate(settled(), { forward: 1 }, { seconds: 3, colliders: [pillar] });

    expect(Math.hypot(position.x - pillar.x, position.z - pillar.z)).toBeGreaterThanOrEqual(
      1 + PLAYER_RADIUS - 1e-6,
    );
  });
});

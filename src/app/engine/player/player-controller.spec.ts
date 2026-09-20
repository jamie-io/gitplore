import { Vector3 } from 'three';
import { Collider, HeightField } from './collision';
import {
  AIR_CONTROL,
  GRAVITY,
  JUMP_SPEED,
  MoveIntent,
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  PlayerController,
  RUN_MULTIPLIER,
  STRIDE_LENGTH,
  WALK_SPEED,
} from './player-controller';

const FLAT: HeightField = { heightAt: () => 0 };
const TAU = Math.PI * 2;
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

/** Metres per second over one frame — the speed the player actually travels at, not the one asked for. */
function frameSpeed(
  player: PlayerController,
  moves: Partial<MoveIntent>,
  ground: HeightField = FLAT,
): number {
  const step = 1 / 60;
  const before = player.position.clone();
  player.update(step, intent(moves), ground, []);
  return Math.hypot(player.position.x - before.x, player.position.z - before.z) / step;
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

describe('PlayerController momentum', () => {
  it('ramps up to speed instead of starting at it', () => {
    expect(frameSpeed(settled(), { forward: 1 })).toBeLessThan(WALK_SPEED / 2);
  });

  it('reaches the walking cap and settles there', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });

    expect(frameSpeed(player, { forward: 1 })).toBeCloseTo(WALK_SPEED, 6);
  });

  it('reaches the running cap and no further', () => {
    const player = settled();
    simulate(player, { forward: 1, run: true }, { seconds: 1 });

    expect(frameSpeed(player, { forward: 1, run: true })).toBeCloseTo(
      WALK_SPEED * RUN_MULTIPLIER,
      6,
    );
  });

  it('takes about a sixth of a second to reach walking speed', () => {
    const player = settled();
    const step = 1 / 240;
    let elapsed = 0;

    while (elapsed < 1) {
      const before = player.position.z;
      player.update(step, intent({ forward: 1 }), FLAT, []);
      if (Math.abs(player.position.z - before) / step >= WALK_SPEED - 1e-9) {
        break;
      }
      elapsed += step;
    }

    expect(elapsed).toBeGreaterThan(0.12);
    expect(elapsed).toBeLessThan(0.2);
  });

  it('carries on for a moment after the keys are let go', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });

    expect(frameSpeed(player, {})).toBeGreaterThan(WALK_SPEED / 2);
  });

  it('comes to a complete stop shortly afterwards', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });

    simulate(player, {}, { seconds: 0.5 });
    const stopped = player.position.z;
    simulate(player, {}, { seconds: 0.5 });

    expect(player.position.z).toBe(stopped);
  });

  it('steers only weakly while off the ground', () => {
    const airborne = settled();
    airborne.update(1 / 60, intent({ jump: true }), FLAT, []);

    expect(frameSpeed(airborne, { forward: 1 })).toBeCloseTo(
      frameSpeed(settled(), { forward: 1 }) * AIR_CONTROL,
      6,
    );
  });

  it('keeps its momentum in the air when the keys are let go', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });
    player.update(1 / 60, intent({ forward: 1, jump: true }), FLAT, []);

    expect(frameSpeed(player, {})).toBeCloseTo(WALK_SPEED, 6);
  });
});

describe('PlayerController stride phase', () => {
  /** The phase gained over one frame, measured the way a consumer watching for a footfall would. */
  function strideAdvance(player: PlayerController, moves: Partial<MoveIntent>): number {
    const before = player.stridePhase;
    player.update(1 / 60, intent(moves), FLAT, []);
    return (player.stridePhase - before + TAU) % TAU;
  }

  it('starts at the beginning of a stride', () => {
    expect(new PlayerController().stridePhase).toBe(0);
  });

  it('advances in step with the ground covered', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });

    const before = player.position.z;
    const advance = strideAdvance(player, { forward: 1 });
    const travelled = Math.abs(player.position.z - before);

    expect(advance).toBeCloseTo((TAU * travelled) / STRIDE_LENGTH, 6);
  });

  it('runs through the stride faster at a run than at a walk', () => {
    const walking = settled();
    simulate(walking, { forward: 1 }, { seconds: 1 });
    const running = settled();
    simulate(running, { forward: 1, run: true }, { seconds: 1 });

    expect(strideAdvance(running, { forward: 1, run: true })).toBeGreaterThan(
      strideAdvance(walking, { forward: 1 }),
    );
  });

  it('stops advancing when a wall stops the player', () => {
    const wall: Collider = { kind: 'aabb', minX: -4, maxX: 4, minZ: -20, maxZ: -3 };
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 3, colliders: [wall] });
    const pinned = player.stridePhase;
    const against = player.position.z;

    simulate(player, { forward: 1 }, { seconds: 1, colliders: [wall] });

    // Still walking into the wall at full tilt, and still covering no ground at all.
    expect(player.position.z).toBe(against);
    expect(player.stridePhase).toBe(pinned);
  });

  it('holds still while the player stands still', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });
    simulate(player, {}, { seconds: 1 });
    const standing = player.stridePhase;

    simulate(player, {}, { seconds: 1 });

    expect(player.stridePhase).toBe(standing);
  });

  it('holds still while the player is off the ground', () => {
    const player = settled();
    simulate(player, { forward: 1 }, { seconds: 1 });
    player.update(1 / 60, intent({ forward: 1, jump: true }), FLAT, []);
    const airborne = player.stridePhase;

    player.update(1 / 60, intent({ forward: 1 }), FLAT, []);

    expect(player.stridePhase).toBe(airborne);
  });

  it('stays inside one turn however far the player walks', () => {
    const player = settled();
    simulate(player, { forward: 1, run: true }, { seconds: 10 });

    expect(player.stridePhase).toBeGreaterThanOrEqual(0);
    expect(player.stridePhase).toBeLessThan(TAU);
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

  it('stays on the ground while walking down a slope', () => {
    const ramp: HeightField = { heightAt: (_x, z) => Math.min(0, z) * 0.4 };

    const player = settled(ramp);
    simulate(player, { forward: 1, run: true }, { seconds: 1, ground: ramp });

    expect(player.position.y).toBeCloseTo(
      Math.min(0, player.position.z) * 0.4 + PLAYER_EYE_HEIGHT,
      4,
    );

    // Still footed rather than falling, which is the whole point: the jump keeps working downhill.
    const before = player.position.y;
    player.update(1 / 60, intent({ forward: 1, run: true, jump: true }), ramp, []);

    expect(player.position.y).toBeGreaterThan(before);
  });

  it('jumps its whole arc and lands without a snap at the end', () => {
    const player = settled();
    const floor = player.position.y;
    player.update(1 / 60, intent({ jump: true }), FLAT, []);

    let apex = player.position.y;
    let longestDrop = 0;
    while (player.position.y > floor) {
      const previous = player.position.y;
      player.update(1 / 60, NO_INTENT, FLAT, []);
      apex = Math.max(apex, player.position.y);
      longestDrop = Math.max(longestDrop, previous - player.position.y);
    }

    expect(apex - floor).toBeGreaterThan(0.9);
    expect(player.position.y).toBe(floor);
    // The arc falls all the way to the floor: no single frame drops further than gravity could
    // carry the player at the speed they land with.
    expect(longestDrop).toBeLessThanOrEqual(JUMP_SPEED / 60 + GRAVITY / (60 * 60));
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

describe('PlayerController coyote time', () => {
  /** A plateau that ends at z = -5, so walking forward runs off a two-metre drop. */
  const ledge: HeightField = { heightAt: (_x, z) => (z > -5 ? 2 : 0) };

  /** Walks the player forward until the ground has fallen away beneath them. */
  function walkOff(): PlayerController {
    const player = settled(ledge);
    while (player.position.z > -5.2) {
      player.update(1 / 60, intent({ forward: 1 }), ledge, []);
    }
    return player;
  }

  it('still jumps in the moment after walking off an edge', () => {
    const player = walkOff();
    const leaving = player.position.y;

    player.update(1 / 60, intent({ forward: 1, jump: true }), ledge, []);

    expect(player.position.y).toBeGreaterThan(leaving);
  });

  it('no longer jumps once the grace has run out', () => {
    const player = walkOff();
    for (let i = 0; i < 12; i++) {
      player.update(1 / 60, intent({ forward: 1 }), ledge, []);
    }
    const falling = player.position.y;

    player.update(1 / 60, intent({ forward: 1, jump: true }), ledge, []);

    expect(player.position.y).toBeLessThan(falling);
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

  it('steps up onto a crate low enough to climb', () => {
    const crate: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: -20, maxZ: -3, top: 0.4 };

    const position = simulate(settled(), { forward: 1 }, { seconds: 2, colliders: [crate] });

    expect(position.z).toBeLessThan(-3);
    expect(position.y).toBeCloseTo(0.4 + PLAYER_EYE_HEIGHT, 4);
  });

  it('is stopped by a block whose top is out of reach', () => {
    const block: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: -20, maxZ: -3, top: 1.2 };

    const position = simulate(settled(), { forward: 1 }, { seconds: 2, colliders: [block] });

    expect(position.z).toBeCloseTo(-3 + PLAYER_RADIUS, 4);
    expect(position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 4);
  });

  it('walks off the edge of a crate and falls to the ground', () => {
    const crate: Collider = { kind: 'aabb', minX: -2, maxX: 2, minZ: -6, maxZ: -2, top: 0.8 };
    const player = new PlayerController();
    player.teleport(new Vector3(0, 0.8 + PLAYER_EYE_HEIGHT, -3));

    simulate(player, {}, { seconds: 0.5, colliders: [crate] });
    expect(player.position.y).toBeCloseTo(0.8 + PLAYER_EYE_HEIGHT, 4);

    const position = simulate(player, { forward: 1 }, { seconds: 2, colliders: [crate] });

    expect(position.z).toBeLessThan(-6);
    expect(position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 4);
  });
});

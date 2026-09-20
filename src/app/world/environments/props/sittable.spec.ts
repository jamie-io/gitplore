import { TestBed } from '@angular/core/testing';
import { Vector3 } from 'three';
import { InteractionSystem } from '@engine/interaction/interaction.system';
import { InputService } from '@engine/input.service';
import { resolveCollisions } from '@engine/player/collision';
import { NO_INTENT, PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { stubContext } from '@engine/testing/world-context';
import { Sittable } from './sittable';

const ground = { heightAt: () => 0 };

describe('Sittable', () => {
  let input: InputService;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    input = TestBed.inject(InputService);
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    input.attach(canvas);
  });

  afterEach(() => {
    input.releaseCapture();
    canvas.remove();
  });

  it('settles the player onto the seat and captures controls inside its radius', () => {
    const ctx = stubContext();
    const target = new Sittable({
      id: 'test:bench',
      position: new Vector3(0, 0, -2),
      rotationY: 0,
      ground,
      input,
    });
    const interaction = new InteractionSystem();

    target.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, 0), 0);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBe(target.interactables[0]);

    const approached = ctx.player.position.clone();
    target.interactables[0].onInteract();

    expect(target.seated).toBe(true);
    expect(input.mode()).toBe('captured');
    expect(ctx.player.position.distanceTo(approached)).toBeGreaterThan(0.1);
    for (let frame = 0; frame < 120; frame++) {
      ctx.player.update(1 / 60, NO_INTENT, ground, target.colliders);
    }
    expect(ctx.player.position.y).toBeLessThan(PLAYER_EYE_HEIGHT);
    expect(Math.abs(ctx.player.position.z + 2)).toBeLessThanOrEqual(0.42);

    ctx.player.teleport(new Vector3(0, 1.7, -8), 0);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBeNull();

    input.releaseCapture();
    expect(target.seated).toBe(false);
    for (let frame = 0; frame < 120; frame++) {
      ctx.player.update(1 / 60, NO_INTENT, ground, target.colliders);
    }
    expect(ctx.player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 4);

    target.dispose();
  });

  it('keeps its seat collider aligned with a rotated bench', () => {
    const target = new Sittable({
      id: 'test:rotated-bench',
      position: new Vector3(0, 0, -2),
      rotationY: Math.PI / 2,
      ground,
      input,
    });

    expect(resolveCollisions(0.85, -2, 0.35, target.colliders, -Infinity)).toEqual({
      x: 0.85,
      z: -2,
    });

    target.dispose();
  });

  it('does not seat twice while capture is already held', () => {
    const ctx = stubContext();
    let sits = 0;
    const target = new Sittable({
      id: 'test:bench',
      position: new Vector3(0, 0, -2),
      rotationY: 0,
      ground,
      input,
      onSit: () => sits++,
    });

    target.init(ctx);
    target.interactables[0].onInteract();
    target.interactables[0].onInteract();

    expect(sits).toBe(1);
    expect(target.seated).toBe(true);

    target.dispose();
  });

  it('removes the bench when disposed', () => {
    const ctx = stubContext();
    const target = new Sittable({
      id: 'test:bench',
      position: new Vector3(0, 0, -2),
      rotationY: 0,
      ground,
      input,
    });

    target.init(ctx);
    target.dispose();

    expect(ctx.scene.children).toHaveLength(0);
  });
});

import { Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { Creature } from './creature';

const ground = { heightAt: () => 0 };

function creature(seed: number, behavior: 'wander' | 'follow' = 'wander'): Creature {
  return new Creature({
    id: `test:creature:${seed}`,
    position: new Vector3(0, 0, -2),
    ground,
    seed,
    behavior,
    reducedMotion: () => false,
  });
}

describe('Creature', () => {
  it('replays the same seeded wander path', () => {
    const first = creature(42);
    const second = creature(42);
    const firstContext = stubContext();
    const secondContext = stubContext();

    first.init(firstContext);
    second.init(secondContext);
    for (const dt of [0.1, 0.2, 0.3, 0.5, 0.7]) {
      first.update(dt, firstContext);
      second.update(dt, secondContext);
    }

    expect(first.position.x).toBeCloseTo(second.position.x, 8);
    expect(first.position.z).toBeCloseTo(second.position.z, 8);
    expect(first.position.distanceTo(new Vector3(0, 0, -2))).toBeGreaterThan(0);

    first.dispose();
    second.dispose();
  });

  it('follows a nearby player but wanders when the player leaves its radius', () => {
    const target = creature(7, 'follow');
    const ctx = stubContext();
    target.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, 2), 0);

    const before = target.position.clone();
    target.update(0.5, ctx);
    const near = target.position.clone();
    expect(near.z).toBeGreaterThan(before.z);

    ctx.player.teleport(new Vector3(0, 1.7, 30), 0);
    target.update(0.5, ctx);
    expect(target.position.distanceTo(near)).toBeGreaterThan(0);

    target.dispose();
  });

  it('stops moving under reduced motion and disposes its body', () => {
    const target = new Creature({
      id: 'test:still-creature',
      position: new Vector3(0, 0, -2),
      ground,
      seed: 1,
      behavior: 'wander',
      reducedMotion: () => true,
    });
    const ctx = stubContext();
    target.init(ctx);
    const before = target.position.clone();

    target.update(1, ctx);

    expect(target.position).toEqual(before);
    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });
});

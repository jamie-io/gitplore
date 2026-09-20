import { Vector3 } from 'three';
import { InteractionSystem } from '@engine/interaction/interaction.system';
import { resolveCollisions } from '@engine/player/collision';
import { stubContext } from '@engine/testing/world-context';
import { Door } from './door';

const ground = { heightAt: () => 0 };

function door(): Door {
  return new Door({
    id: 'test:door',
    position: new Vector3(0, 0, -2),
    rotationY: 0,
    ground,
    reducedMotion: () => true,
  });
}

describe('Door', () => {
  it('opens on approach, disables its collider, and cannot close on the visitor', () => {
    const ctx = stubContext();
    const target = door();
    const interaction = new InteractionSystem();

    target.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, 0), 0);
    target.update(0, ctx);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBe(target.interactables[0]);

    target.interactables[0].onInteract();
    expect(target.open).toBe(true);
    expect(resolveCollisions(0, -2, 0.35, target.colliders, -Infinity)).toEqual({ x: 0, z: -2 });

    target.interactables[0].onInteract();
    expect(target.open).toBe(true);

    target.dispose();
  });

  it('re-enables its collider after the visitor leaves its radius', () => {
    const ctx = stubContext();
    const target = door();

    target.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, 0), 0);
    target.update(0, ctx);
    target.interactables[0].onInteract();
    expect(target.open).toBe(true);

    ctx.player.teleport(new Vector3(0, 1.7, -8), 0);
    target.update(0, ctx);

    expect(target.open).toBe(false);
    expect(resolveCollisions(0, -2, 0.35, target.colliders, -Infinity).z).toBeLessThan(-2.3);

    target.dispose();
  });

  it('removes its geometry when disposed', () => {
    const ctx = stubContext();
    const target = door();

    target.init(ctx);
    target.dispose();

    expect(ctx.scene.children).toHaveLength(0);
  });
});

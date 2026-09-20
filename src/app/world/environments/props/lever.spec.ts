import { Vector3 } from 'three';
import { InteractionSystem } from '@engine/interaction/interaction.system';
import { stubContext } from '@engine/testing/world-context';
import { Lever } from './lever';

const ground = { heightAt: () => 0 };

function lever(onToggle: (active: boolean) => void = () => undefined): Lever {
  return new Lever({
    id: 'test:lever',
    position: new Vector3(0, 0, -2),
    rotationY: 0,
    ground,
    onToggle,
    reducedMotion: () => true,
  });
}

describe('Lever', () => {
  it('toggles only when the player approaches it and calls its effect', () => {
    const ctx = stubContext();
    const target = lever();
    const interaction = new InteractionSystem();

    target.init(ctx);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBe(target.interactables[0]);

    target.interactables[0].onInteract();
    expect(target.active).toBe(true);

    ctx.player.teleport(new Vector3(0, 1.7, -8), 0);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBeNull();
    expect(target.active).toBe(true);

    target.dispose();
  });

  it('reports each state change to its owner', () => {
    const states: boolean[] = [];
    const target = lever((active) => states.push(active));

    target.interactables[0].onInteract();
    target.interactables[0].onInteract();

    expect(states).toEqual([true, false]);
  });

  it('removes its geometry when disposed', () => {
    const ctx = stubContext();
    const target = lever();

    target.init(ctx);
    expect(ctx.scene.children.length).toBe(1);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });
});

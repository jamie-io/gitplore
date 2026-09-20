import { IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { InteractionSystem } from '@engine/interaction/interaction.system';
import { stubContext } from '@engine/testing/world-context';
import { HiddenPlace } from './hidden-place';

const ground = { heightAt: () => 0 };

function hiddenPlace(onEnter: () => void = () => undefined): HiddenPlace {
  const thing = new Mesh(
    new IcosahedronGeometry(0.25, 0),
    new MeshStandardMaterial({ color: 0xffcf70 }),
  );
  thing.name = 'hidden-place:thing';
  return new HiddenPlace({
    id: 'test:hidden-place',
    position: new Vector3(0, 0, -2),
    rotationY: 0,
    ground,
    thing,
    onEnter,
  });
}

describe('HiddenPlace', () => {
  it('offers a real place and its thing when the visitor reaches it', () => {
    const ctx = stubContext();
    const target = hiddenPlace();
    const interaction = new InteractionSystem();

    target.init(ctx);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBe(target.interactables[0]);
    expect(ctx.scene.getObjectByName('hidden-place:thing')).toBeDefined();
    expect(target.colliders.length).toBe(3);

    ctx.player.teleport(new Vector3(0, 1.7, -8), 0);
    interaction.update(ctx.player, target.interactables);
    expect(interaction.nearby).toBeNull();

    target.dispose();
  });

  it('calls its entrance effect without tracking a completion counter', () => {
    let entered = 0;
    const target = hiddenPlace(() => entered++);

    target.interactables[0].onInteract();
    target.interactables[0].onInteract();

    expect(entered).toBe(2);
  });

  it('removes the place and the hidden thing when disposed', () => {
    const ctx = stubContext();
    const target = hiddenPlace();

    target.init(ctx);
    target.dispose();

    expect(ctx.scene.children).toHaveLength(0);
  });
});

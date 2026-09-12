import { Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { BOOTH, SprayBooth } from './spray-booth';

const ground = { heightAt: () => 0 };

function booth(): SprayBooth {
  return new SprayBooth({
    origin: new Vector3(0, 0, -10),
    rotationY: 0,
    ground,
    accent: '#1b4f8f',
  });
}

describe('SprayBooth', () => {
  it('quotes the booth it is modelled on', () => {
    expect(BOOTH.model).toContain('NOVA VERTA');
    expect(BOOTH.specs.length).toBeGreaterThan(2);
  });

  it('walls the booth on three sides and leaves the front open', () => {
    const target = booth();

    expect(target.colliders.length).toBe(3);
    const opening = target.opening;
    const blocked = target.colliders.some(
      (collider) =>
        collider.kind === 'aabb' &&
        opening.x >= collider.minX &&
        opening.x <= collider.maxX &&
        opening.z >= collider.minZ &&
        opening.z <= collider.maxZ,
    );
    expect(blocked).toBe(false);
  });

  it('lights the inside, because an unlit booth is a box', () => {
    const ctx = stubContext();
    const target = booth();

    target.init(ctx);

    expect(target.lit).toBe(true);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = booth();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

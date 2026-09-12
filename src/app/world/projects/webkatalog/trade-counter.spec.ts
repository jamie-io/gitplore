import { Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { OCI_SIGN, TradeCounter } from './trade-counter';

const ground = { heightAt: () => 2 };

function counter(): TradeCounter {
  return new TradeCounter({ origin: new Vector3(6, 0, -4), rotationY: 0.5, ground });
}

describe('TradeCounter', () => {
  it('names the hand-off that makes the shop B2B rather than a webshop', () => {
    expect(OCI_SIGN).toContain('OCI 5.0');
  });

  it('sits on the ground at its origin', () => {
    const target = counter();

    expect(target.position.x).toBe(6);
    expect(target.position.z).toBe(-4);
    expect(target.position.y).toBe(2);
  });

  it('blocks, so the counter is furniture and not a hologram', () => {
    const [collider] = counter().colliders;

    expect(collider.kind).toBe('aabb');
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = counter();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

import { Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PlantRoom, ROOM_HALF_WIDTH, SERVICES } from './plant-room';

const ground = { heightAt: () => 0 };

function room(): PlantRoom {
  return new PlantRoom({
    origin: new Vector3(0, 0, -12),
    rotationY: 0,
    ground,
    accent: '#2f6b4f',
  });
}

describe('PlantRoom', () => {
  it('runs one line per building service', () => {
    expect(SERVICES.length).toBeGreaterThan(2);
    expect(room().pipeEnds.length).toBe(SERVICES.length);
  });

  it('terminates every line inside the room, because nothing here connects outwards', () => {
    // The README's own claim — local fonts, no analytics, no cookie banner — rendered as plant:
    // every supply line ends in a capped flange rather than leaving the building.
    const target = room();

    for (const end of target.pipeEnds) {
      expect(Math.abs(end.x - target.centre.x)).toBeLessThanOrEqual(ROOM_HALF_WIDTH);
      expect(Number.isFinite(end.y)).toBe(true);
    }
  });

  it('blocks the plant, which is equipment and not scenery to walk through', () => {
    expect(room().colliders.length).toBeGreaterThan(0);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = room();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

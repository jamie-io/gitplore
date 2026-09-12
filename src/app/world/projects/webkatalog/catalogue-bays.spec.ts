import { Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { BAYS, CONFIGURABLE, CatalogueBays, MATERIALS } from './catalogue-bays';

const ground = { heightAt: () => 0 };

function bays(): CatalogueBays {
  return new CatalogueBays({
    origin: new Vector3(0, 0, -8),
    rotationY: 0,
    ground,
    accent: '#8f6a2f',
  });
}

describe('CatalogueBays', () => {
  it('stands one bay per catalogue entry, evenly spaced and on the ground', () => {
    const positions = bays().positions;

    expect(positions.length).toBe(BAYS.length);
    for (const position of positions) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
      expect(position.y).toBe(0);
    }
    const gaps = positions.slice(1).map((position, index) => position.x - positions[index].x);
    expect(gaps.every((gap) => gap > 0)).toBe(true);
    expect(new Set(gaps.map((gap) => gap.toFixed(3))).size).toBe(1);
  });

  it('blocks every bay, so the furniture cannot be walked through', () => {
    expect(bays().colliders.length).toBe(BAYS.length);
  });

  it('offers exactly one bay to configure, the way the catalogue does', () => {
    const interactables = bays().interactables;

    expect(interactables.length).toBe(1);
    expect(interactables[0].prompt).toBe('Material wechseln');
    expect(interactables[0].position.x).toBeCloseTo(bays().positions[CONFIGURABLE].x, 5);
  });

  it('advances the configured material and the price with it', () => {
    const target = bays();
    target.init(stubContext());

    expect(target.material.label).toBe(MATERIALS[0].label);
    target.configure();
    expect(target.material.label).toBe(MATERIALS[1].label);
    expect(target.material.price).toBe(MATERIALS[1].price);
  });

  it('repaints the desk itself, not just the label', () => {
    const target = bays();
    target.init(stubContext());
    const desk = target.deskColour();

    target.configure();

    expect(desk).toBe(MATERIALS[0].color);
    expect(target.deskColour()).toBe(MATERIALS[1].color);
  });

  it('wraps back to the first material', () => {
    const target = bays();
    target.init(stubContext());

    MATERIALS.forEach(() => target.configure());

    expect(target.material.label).toBe(MATERIALS[0].label);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = bays();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

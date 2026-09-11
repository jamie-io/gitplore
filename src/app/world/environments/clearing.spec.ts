import { stubContext } from '@engine/testing/world-context';
import { ClearingEnvironment } from './clearing';
import { MIN_LANDMARK_SEPARATION, RING_RADIUS } from './placement';
import { terrainHeightAt } from './terrain';

const clearing = () => new ClearingEnvironment({ reducedMotion: () => false });

describe('ClearingEnvironment', () => {
  it('names the place in German, for the HUD and the arrival announcement', () => {
    expect(clearing().name).toBe('Lichtung');
  });

  it('reports ground height straight from the terrain', () => {
    expect(clearing().ground.heightAt(40, -25)).toBe(terrainHeightAt(40, -25));
  });

  it('blocks the monument before anything is initialised', () => {
    // Scenes collect colliders in their constructor, so this must not need `init`.
    expect(clearing().colliders.length).toBeGreaterThan(0);
  });

  it('lays anchors out on the ring, at the ring radius', () => {
    const [first] = clearing().anchors(3);

    expect(Math.hypot(first.position[0], first.position[2])).toBeCloseTo(RING_RADIUS, 5);
  });

  it('keeps generated anchors clear of a pinned landmark', () => {
    const pinned = [[0, 0, RING_RADIUS] as const];

    for (const anchor of clearing().anchors(3, pinned)) {
      const distance = Math.hypot(anchor.position[0] - 0, anchor.position[2] - RING_RADIUS);
      expect(distance).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
    }
  });

  it('builds terrain, sky and the monument into the scene and takes them out again', () => {
    const ctx = stubContext();
    const environment = clearing();

    environment.init(ctx);
    const built = ctx.scene.children.length;
    environment.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

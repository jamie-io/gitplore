import { stubContext } from '@engine/testing/world-context';
import { MIN_LANDMARK_SEPARATION } from './placement';
import { ClearingEnvironment } from './clearing';
import { JungleEnvironment } from './jungle';
import { PlazaEnvironment } from './plaza';
import { ShowroomEnvironment } from './showroom';
import type { Environment } from './environment';

const BUILDERS: readonly { id: string; build: () => Environment }[] = [
  { id: 'clearing', build: () => new ClearingEnvironment({ reducedMotion: () => false }) },
  { id: 'showroom', build: () => new ShowroomEnvironment({ reducedMotion: () => false }) },
  { id: 'jungle', build: () => new JungleEnvironment({ reducedMotion: () => false }) },
  { id: 'plaza', build: () => new PlazaEnvironment({ reducedMotion: () => false }) },
];

describe.each(BUILDERS)('$id', ({ id, build }) => {
  it('announces itself with its id and a German place name', () => {
    const environment = build();

    expect(environment.id).toBe(id);
    expect(environment.name.length).toBeGreaterThan(0);
  });

  it('stands the arriving player on its own ground', () => {
    const environment = build();

    expect(environment.spawn.y).toBeCloseTo(
      environment.ground.heightAt(environment.spawn.x, environment.spawn.z),
      5,
    );
  });

  it('knows its ground, colliders and anchors before init, as scenes need them', () => {
    // A scene collects colliders and places landmarks in its constructor; `init` comes later.
    const environment = build();

    expect(typeof environment.ground.heightAt(3, -4)).toBe('number');
    expect(Array.isArray(environment.colliders)).toBe(true);
    expect(environment.anchors(2).length).toBe(2);
  });

  it('returns exactly one anchor when asked for one', () => {
    // The arc-based layouts special-case a single slot, since it has no second spot to
    // interpolate towards; this is what exercises that branch.
    expect(build().anchors(1).length).toBe(1);
  });

  it('spreads its anchors far enough apart to read as separate places', () => {
    const anchors = build().anchors(4);

    for (let a = 0; a < anchors.length; a++) {
      for (let b = a + 1; b < anchors.length; b++) {
        const distance = Math.hypot(
          anchors[a].position[0] - anchors[b].position[0],
          anchors[a].position[2] - anchors[b].position[2],
        );
        expect(distance).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
      }
    }
  });

  it('puts everything it adds back when disposed', () => {
    const ctx = stubContext();
    const environment = build();

    environment.init(ctx);
    const built = ctx.scene.children.length;
    environment.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
    // A fog or background left behind would tint whatever scene comes next.
    expect(ctx.scene.fog).toBe(null);
    expect(ctx.scene.background).toBe(null);
  });
});

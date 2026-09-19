import { Color, InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { qualitySettings, QualityTier } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { ClearingEnvironment, OPEN_GROUND, lichtungGround } from './clearing';
import { MIN_LANDMARK_SEPARATION, RING_RADIUS } from './placement';
import { isExcluded } from './scatter';
import { POND, terrainHeightAt } from './terrain';

const clearing = () => new ClearingEnvironment({ reducedMotion: () => false });

function contextAt(tier: QualityTier): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function colourDistance(a: Color, b: Color): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

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

describe('ClearingEnvironment surroundings', () => {
  it('keeps trees and boulders out of the meadow, the portal ring, the spoke and the pond', () => {
    // The first two colliders are the monument's and the pond's.
    for (const collider of clearing().colliders.slice(2)) {
      if (collider.kind !== 'cylinder') {
        throw new Error('expected only trunk and boulder cylinders after the first two');
      }
      expect(isExcluded(collider.x, collider.z, OPEN_GROUND)).toBe(false);
    }
  });

  it('stops visitors from wading into the pond', () => {
    expect(clearing().colliders).toContainEqual({
      kind: 'cylinder',
      x: POND.x,
      z: POND.z,
      radius: POND.radius * 0.95,
    });
  });

  it('stands the same trees in the same places on every visit', () => {
    expect(clearing().colliders).toEqual(clearing().colliders);
  });

  it('grows fewer small plants on weaker machines', () => {
    const flowers = (tier: QualityTier) => {
      const ctx = contextAt(tier);
      const environment = clearing();
      environment.init(ctx);
      const count = ctx.scene.children
        .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
        .filter((mesh) => mesh.name.startsWith('flowers'))
        .reduce((sum, mesh) => sum + mesh.count, 0);
      environment.dispose();
      return count;
    };

    expect(flowers('low')).toBeLessThan(flowers('high'));
  });

  it('wears a dirt path along the portal ring', () => {
    const dirt = new Color(0x9c7d56);
    const onPath = lichtungGround(RING_RADIUS, 0, 0, 0).clone();
    const beside = lichtungGround(RING_RADIUS + 6, 0, 0, 0).clone();

    expect(colourDistance(onPath, dirt)).toBeLessThan(colourDistance(beside, dirt));
  });

  it('holds every animation still for visitors who prefer reduced motion', () => {
    const environment = new ClearingEnvironment({ reducedMotion: () => true });
    const ctx = stubContext();
    environment.init(ctx);

    environment.update(0.5, ctx);

    expect(environment.shared.time.value).toBe(0);
    environment.dispose();
  });

  it('lets time run for everyone else', () => {
    const environment = clearing();
    const ctx = stubContext();
    environment.init(ctx);

    environment.update(0.5, ctx);

    expect(environment.shared.time.value).toBeCloseTo(0.5, 9);
    environment.dispose();
  });

  it('keeps generated anchors on solid ground, clear of each other', () => {
    const anchors = clearing().anchors(4);
    for (const anchor of anchors) {
      expect(terrainHeightAt(anchor.position[0], anchor.position[2])).toBeGreaterThan(-5.5);
    }
    for (let a = 0; a < anchors.length; a++) {
      for (let b = a + 1; b < anchors.length; b++) {
        expect(
          Math.hypot(
            anchors[a].position[0] - anchors[b].position[0],
            anchors[a].position[2] - anchors[b].position[2],
          ),
        ).toBeGreaterThanOrEqual(MIN_LANDMARK_SEPARATION);
      }
    }
  });
});

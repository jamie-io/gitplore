import { Points, ShaderMaterial, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { qualitySettings } from '@engine/capability.service';
import type { QualityTier } from '@engine/capability.service';
import type { WorldContext } from '@engine/world-object';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { FIREFLY_GLADE } from '../jungle-layout';
import { MAX_STAR_LANTERNS, PATH_LAMP_COUNT, SWARM, StarLanterns } from './star-lanterns';

const PROJECT = PROJECT_FIXTURES[0];
const options = (project: Project) => ({
  project,
  from: { x: 0, y: 0, z: 15 },
  to: { x: 0, y: 0, z: -17 },
  reducedMotion: () => true,
});

function pointsFor(
  project: Project,
  tier: QualityTier = 'high',
): {
  ctx: ReturnType<typeof stubContext>;
  points: Points;
  lanterns: StarLanterns;
} {
  const base = stubContext();
  const ctx = { ...base, quality: qualitySettings(tier) };
  const lanterns = new StarLanterns(options(project));
  lanterns.init(ctx);
  const points = ctx.scene.getObjectByName('star-lanterns');
  expect(points).toBeInstanceOf(Points);
  return { ctx, points: points as Points, lanterns };
}

describe('StarLanterns', () => {
  it('uses deterministic path lamps when stars are absent or zero', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      for (const project of [PROJECT, { ...PROJECT, stars: 0 }]) {
        const { ctx, points, lanterns } = pointsFor(project, tier);

        expect(points.geometry.getAttribute('position').count).toBe(PATH_LAMP_COUNT);
        lanterns.dispose();
        expect(ctx.scene.children).toHaveLength(0);
      }
    }
  });

  it('caps star lanterns so repository counts cannot exhaust the fill-rate budget', () => {
    const { ctx, points, lanterns } = pointsFor({ ...PROJECT, stars: 999 });

    expect(points.geometry.getAttribute('position').count).toBe(MAX_STAR_LANTERNS);
    lanterns.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('disposes its points when the repository world closes', () => {
    const ctx = stubContext();
    const lanterns = new StarLanterns(options({ ...PROJECT, stars: 5 }));

    lanterns.init(ctx);
    lanterns.dispose();

    expect(ctx.scene.children).toHaveLength(0);
  });

  describe('the jungle’s firefly swarm', () => {
    const GROUND = { heightAt: (x: number, z: number) => 0.3 + 0.02 * x - 0.01 * z };

    function swarm(
      tier: QualityTier = 'high',
      reduced = false,
    ): { ctx: ReturnType<typeof stubContext>; points: Points; jungle: StarLanterns } {
      const ctx = { ...stubContext(), quality: qualitySettings(tier) };
      const jungle = new StarLanterns({
        ...options({ ...PROJECT, stars: 5 }),
        reducedMotion: () => reduced,
        skin: 'jungle',
        ground: GROUND,
      });
      jungle.init(ctx);
      return { ctx, points: ctx.scene.getObjectByName('star-lanterns') as Points, jungle };
    }

    function positions(points: Points): Vector3[] {
      const attribute = points.geometry.getAttribute('position');
      return Array.from({ length: attribute.count }, (_, i) =>
        new Vector3().fromBufferAttribute(attribute, i),
      );
    }

    function run(jungle: StarLanterns, ctx: WorldContext, seconds: number, dt = 1 / 30): void {
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        jungle.update(dt, ctx);
      }
    }

    it('is fourteen amber fireflies whatever the stars, eight on the low tier', () => {
      for (const [tier, count] of [
        ['high', 14],
        ['medium', 14],
        ['low', 8],
      ] as const) {
        const { ctx, points, jungle } = swarm(tier);

        expect(points.geometry.getAttribute('position').count).toBe(count);
        expect((points.material as ShaderMaterial).uniforms['colour'].value.getHex()).toBe(
          0xe0a13c,
        );
        jungle.dispose();
        expect(ctx.scene.children).toHaveLength(0);
      }
    });

    it('drifts over the exhibit glade, a little over the ground', () => {
      const { points } = swarm();

      for (const at of positions(points)) {
        const x = (at.x - FIREFLY_GLADE.x) / FIREFLY_GLADE.rx;
        const z = (at.z - FIREFLY_GLADE.z) / FIREFLY_GLADE.rz;
        expect(x * x + z * z).toBeLessThanOrEqual(1);
        const above = at.y - GROUND.heightAt(at.x, at.z);
        expect(above).toBeGreaterThanOrEqual(SWARM.minY);
        expect(above).toBeLessThanOrEqual(SWARM.maxY);
      }
    });

    it('gathers round the player while the lit lantern is within 11 m, and drifts home after', () => {
      const { ctx, points, jungle } = swarm();
      const home = positions(points);
      const player = new Vector3(FIREFLY_GLADE.x + 2, 1.9, FIREFLY_GLADE.z + 6);
      ctx.player.teleport(player, 0);

      jungle.setLantern({ x: player.x, z: player.z });
      run(jungle, ctx, 3);
      for (const at of positions(points)) {
        expect(Math.hypot(at.x - player.x, at.z - player.z)).toBeLessThan(SWARM.orbit.max + 0.01);
      }

      jungle.setLantern(null);
      run(jungle, ctx, 3);
      positions(points).forEach((at, i) => expect(at.distanceTo(home[i])).toBeLessThan(1e-4));
    });

    it('stays over the glade while the lit lantern is farther than 11 m', () => {
      const { ctx, points, jungle } = swarm();
      const home = positions(points);
      ctx.player.teleport(new Vector3(20, 1.9, 10), 0);

      jungle.setLantern({ x: 20, z: 10 });
      run(jungle, ctx, 3);

      positions(points).forEach((at, i) => expect(at.distanceTo(home[i])).toBeLessThan(1e-4));
    });

    it('bursts outward when the liana is pulled and settles back within 1.25 s', () => {
      const { ctx, points, jungle } = swarm();
      const home = positions(points);
      const centre = new Vector3(FIREFLY_GLADE.x, 0, FIREFLY_GLADE.z);
      const spread = (all: Vector3[]) =>
        all.reduce((sum, at) => sum + Math.hypot(at.x - centre.x, at.z - centre.z), 0);

      jungle.burst();
      run(jungle, ctx, 0.6);
      expect(spread(positions(points))).toBeGreaterThan(spread(home) + home.length * 1.5);

      run(jungle, ctx, 0.7);
      positions(points).forEach((at, i) => expect(at.distanceTo(home[i])).toBeLessThan(1e-4));
    });

    it('glows brighter once Deslopify is installed', () => {
      const { ctx, points, jungle } = swarm();
      const colour = () =>
        (points.material as ShaderMaterial).uniforms['colour'].value as { r: number };
      const before = colour().r;

      jungle.setBright(true);
      run(jungle, ctx, 1 / 30);
      expect(colour().r).toBeGreaterThan(before * 1.3);

      jungle.setBright(false);
      run(jungle, ctx, 1 / 30);
      expect(colour().r).toBeCloseTo(before, 6);
    });

    it('holds still under reduced motion: no gathering, no burst', () => {
      const { ctx, points, jungle } = swarm('high', true);
      const home = positions(points);
      ctx.player.teleport(new Vector3(FIREFLY_GLADE.x, 1.9, FIREFLY_GLADE.z + 4), 0);

      jungle.setLantern({ x: FIREFLY_GLADE.x, z: FIREFLY_GLADE.z + 4 });
      jungle.burst();
      run(jungle, ctx, 0.6);

      positions(points).forEach((at, i) => expect(at.distanceTo(home[i])).toBeLessThan(1e-4));
    });

    it('starts over on reset', () => {
      const { ctx, points, jungle } = swarm();
      const home = positions(points);
      ctx.player.teleport(new Vector3(FIREFLY_GLADE.x, 1.9, FIREFLY_GLADE.z + 4), 0);
      jungle.setLantern({ x: FIREFLY_GLADE.x, z: FIREFLY_GLADE.z + 4 });
      jungle.burst();
      run(jungle, ctx, 0.5);

      jungle.resetSwarm();
      run(jungle, ctx, 1 / 30);

      positions(points).forEach((at, i) => expect(at.distanceTo(home[i])).toBeLessThan(1e-4));
    });
  });
});

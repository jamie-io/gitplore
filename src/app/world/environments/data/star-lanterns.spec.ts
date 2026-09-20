import { Points } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { qualitySettings } from '@engine/capability.service';
import type { QualityTier } from '@engine/capability.service';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import type { Project } from '@content/project.model';
import { MAX_STAR_LANTERNS, PATH_LAMP_COUNT, StarLanterns } from './star-lanterns';

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
});

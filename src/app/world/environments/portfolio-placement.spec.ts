import { readFileSync } from 'node:fs';
import { Texture } from 'three';
import { mergeRepo } from '@content/merge-repo';
import { REPO_OVERRIDES } from '@content/repo-overrides';
import type { SyncedRepo } from '@content/synced-repo';
import { HubScene } from '../hub/hub.scene';
import { ClearingEnvironment } from './clearing';
import { MIN_LANDMARK_SEPARATION } from './placement';

interface PlacedLandmark {
  readonly slug: string;
  readonly x: number;
  readonly z: number;
}

function expectFrontArc(placed: readonly PlacedLandmark[]): void {
  for (const landmark of placed) {
    expect(landmark.z, `${landmark.slug} must stand in front of the spawn`).toBeLessThan(0);
    expect(
      Math.abs(Math.atan2(landmark.x, -landmark.z)),
      `${landmark.slug} must stay within 0.45π of −Z`,
    ).toBeLessThanOrEqual(Math.PI * 0.45);
  }
}

function expectSeparated(placed: readonly PlacedLandmark[]): void {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const distance = Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z);

      expect(distance, `${placed[i].slug} ↔ ${placed[j].slug}`).toBeGreaterThanOrEqual(
        MIN_LANDMARK_SEPARATION,
      );
    }
  }
}

/**
 * The committed portfolio, placed exactly as the deployed hub places it.
 *
 * `merged-projects.spec.ts` cannot hold this assertion: `src/app/content/**` is forbidden by the
 * ESLint layer rules from importing `@world/*`, and placement is a world concern. This is the
 * world-side half of the same guarantee — and the half that catches a ring slot landing on top of
 * a pinned landmark, which content alone cannot see.
 */
const repos: readonly SyncedRepo[] = JSON.parse(readFileSync('public/content/repos.json', 'utf8'));
const projects = repos.map((repo) => mergeRepo(repo, REPO_OVERRIDES[repo.name]));

describe('the committed portfolio in the hub', () => {
  const scene = new HubScene({
    environment: new ClearingEnvironment({ reducedMotion: () => false }),
    reducedMotion: () => false,
    projects,
    onEnter: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });

  it('keeps today’s landmarks in the front arc and separated', () => {
    const placed: PlacedLandmark[] = scene.landmarks.map((landmark) => ({
      slug: landmark.project.slug,
      x: landmark.position.x,
      z: landmark.position.z,
    }));

    expectFrontArc(placed);
    expectSeparated(placed);
  });

  it('fits nine future landmarks in the same front arc without shrinking separation', () => {
    const placed: PlacedLandmark[] = new ClearingEnvironment({ reducedMotion: () => false })
      .anchors(9)
      .map((anchor, index) => ({
        slug: `future-${index}`,
        x: anchor.position[0],
        z: anchor.position[2],
      }));

    expect(placed).toHaveLength(9);
    expectFrontArc(placed);
    expectSeparated(placed);
  });
});

import { readFileSync } from 'node:fs';
import { Texture } from 'three';
import { mergeRepo } from '@content/merge-repo';
import { REPO_OVERRIDES } from '@content/repo-overrides';
import type { SyncedRepo } from '@content/synced-repo';
import { HubScene } from '../hub/hub.scene';
import { ClearingEnvironment } from './clearing';
import {
  FRONT_ARC,
  MIN_LANDMARK_SEPARATION,
  PORTAL_HALF_WIDTH,
  VISIBILITY_MARGIN,
} from './placement';

interface PlacedLandmark {
  readonly slug: string;
  readonly x: number;
  readonly z: number;
}

function expectFrontArc(placed: readonly PlacedLandmark[]): void {
  const angleEpsilon = 1e-10;

  for (const landmark of placed) {
    expect(landmark.z, `${landmark.slug} must stand in front of the spawn`).toBeLessThan(0);
    expect(
      Math.abs(Math.atan2(landmark.x, -landmark.z)),
      `${landmark.slug} must stay within the front arc of −Z`,
    ).toBeLessThanOrEqual(FRONT_ARC / 2 + angleEpsilon);
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

function expectNotOccluded(placed: readonly PlacedLandmark[]): void {
  for (let i = 0; i < placed.length; i++) {
    const first = placed[i];
    const firstRadius = Math.hypot(first.x, first.z);
    const firstBearing = Math.atan2(first.x, -first.z);

    for (let j = i + 1; j < placed.length; j++) {
      const second = placed[j];
      const secondRadius = Math.hypot(second.x, second.z);
      const secondBearing = Math.atan2(second.x, -second.z);
      const minimumBearingDifference =
        Math.max(
          Math.atan(PORTAL_HALF_WIDTH / firstRadius),
          Math.atan(PORTAL_HALF_WIDTH / secondRadius),
        ) + VISIBILITY_MARGIN;

      expect(
        Math.abs(firstBearing - secondBearing),
        `${first.slug} ↔ ${second.slug} must have separate visible bearings`,
      ).toBeGreaterThanOrEqual(minimumBearingDifference - 1e-10);
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

    expect(scene.landmarks).toHaveLength(projects.length);
    expectFrontArc(placed);
    expectSeparated(placed);
    expectNotOccluded(placed);
  });

  it('fits nine future landmarks in the same front arc without shrinking separation', () => {
    const pinned = projects
      .filter((project) => project.landmark.position)
      .map((project) => ({
        slug: project.slug,
        x: project.landmark.position![0],
        z: project.landmark.position![2],
      }));
    const generated = new ClearingEnvironment({ reducedMotion: () => false })
      .anchors(
        6,
        pinned.map(({ x, z }) => [x, 0, z] as const),
      )
      .map((anchor, index) => ({
        slug: `future-${index}`,
        x: anchor.position[0],
        z: anchor.position[2],
      }));
    const placed = [...pinned, ...generated];

    expect(placed).toHaveLength(9);
    expectFrontArc(placed);
    expectSeparated(placed);
    expectNotOccluded(placed);
  });
});

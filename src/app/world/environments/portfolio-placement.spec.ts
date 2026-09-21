import { readFileSync } from 'node:fs';
import { Texture } from 'three';
import type { Collider } from '@engine/player/collision';
import { PLAYER_RADIUS } from '@engine/player/player-controller';
import { BOOM_LENGTH } from '@engine/player/third-person-rig';
import { mergeRepo } from '@content/merge-repo';
import { REPO_OVERRIDES } from '@content/repo-overrides';
import type { SyncedRepo } from '@content/synced-repo';
import { HubScene } from '../hub/hub.scene';
import { ClearingEnvironment } from './clearing';
import {
  FRONT_ARC,
  MIN_LANDMARK_SEPARATION,
  PORTAL_HALF_WIDTH,
  RING_RADIUS,
  VISIBILITY_MARGIN,
} from './placement';
import { LICHTUNG_SIGNPOST_APPROACH, LICHTUNG_SIGNPOST_POSITION } from './signpost';
import { clearance } from './testing/clearance';

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

/** Radians from `from` to `to`, folded into (−π, π]. */
function turn(from: number, to: number): number {
  const delta = (to - from) % (Math.PI * 2);
  return delta > Math.PI ? delta - Math.PI * 2 : delta <= -Math.PI ? delta + Math.PI * 2 : delta;
}

/** The bearing, from −Z like the hub's placement, of (x, z) seen from (viewX, viewZ). */
function bearingFrom(viewX: number, viewZ: number, x: number, z: number): number {
  return Math.atan2(x - viewX, -(z - viewZ));
}

/**
 * The bearings a collider covers as seen from (viewX, viewZ), as an interval around its centre's
 * bearing: a cylinder by its tangents, a box by its four corners.
 */
function coveredBearings(
  collider: Collider,
  viewX: number,
  viewZ: number,
): { readonly from: number; readonly to: number } {
  if (collider.kind === 'cylinder') {
    const centre = bearingFrom(viewX, viewZ, collider.x, collider.z);
    const half = Math.asin(
      Math.min(1, collider.radius / Math.hypot(collider.x - viewX, collider.z - viewZ)),
    );
    return { from: centre - half, to: centre + half };
  }
  const centre = bearingFrom(
    viewX,
    viewZ,
    (collider.minX + collider.maxX) / 2,
    (collider.minZ + collider.maxZ) / 2,
  );
  const offsets = [collider.minX, collider.maxX].flatMap((x) =>
    [collider.minZ, collider.maxZ].map((z) => turn(centre, bearingFrom(viewX, viewZ, x, z))),
  );
  return { from: centre + Math.min(...offsets), to: centre + Math.max(...offsets) };
}

function overlaps(
  first: { readonly from: number; readonly to: number },
  second: { readonly from: number; readonly to: number },
): boolean {
  const centre = (second.from + second.to) / 2;
  const a = { from: turn(centre, first.from), to: turn(centre, first.to) };
  const b = { from: turn(centre, second.from), to: turn(centre, second.to) };
  return a.from <= b.to && b.from <= a.to;
}

/** Whether the straight walk from (ax, az) to (bx, bz) keeps a visitor's width from `colliders`. */
function walkClearance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: readonly Collider[],
): number {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
  let room = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    room = Math.min(room, clearance(ax + (bx - ax) * t, az + (bz - az) * t, colliders));
  }
  return room;
}

describe('the home base at the spawn', () => {
  const scene = new HubScene({
    environment: new ClearingEnvironment({ reducedMotion: () => false }),
    reducedMotion: () => false,
    projects,
    onEnter: () => undefined,
    onContact: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
  const camp = scene.homeBase.colliders;
  const placed = scene.landmarks.map((landmark) => ({
    slug: landmark.project.slug,
    x: landmark.position.x,
    z: landmark.position.z,
  }));
  const pinned = projects
    .filter((project) => project.landmark.position)
    .map((project) => [...project.landmark.position!] as const);
  const nine = [
    ...pinned.map(([x, , z]) => ({ x, z })),
    ...new ClearingEnvironment({ reducedMotion: () => false })
      .anchors(6, pinned)
      .map((anchor) => ({ x: anchor.position[0], z: anchor.position[2] })),
  ];

  it('stands entirely outside the bearing fan every portal can take', () => {
    // The widest a portal on the near ring can reach, seen from the spawn, plus the margin.
    const fan = FRONT_ARC / 2 + Math.atan(PORTAL_HALF_WIDTH / RING_RADIUS) + VISIBILITY_MARGIN;

    expect(camp.length).toBeGreaterThan(0);
    for (const collider of camp) {
      const covered = coveredBearings(collider, 0, 0);
      expect(overlaps(covered, { from: -fan, to: fan }), JSON.stringify(collider)).toBe(false);
    }
  });

  it('hides no portal of today’s hub from the third-person camera at the spawn', () => {
    // At arrival the camera hangs a boom length behind the visitor, who faces −Z.
    const camera = { x: 0, z: BOOM_LENGTH };

    expect(placed).toHaveLength(projects.length);
    for (const portal of placed) {
      const centre = bearingFrom(camera.x, camera.z, portal.x, portal.z);
      const half = Math.atan(
        PORTAL_HALF_WIDTH / Math.hypot(portal.x - camera.x, portal.z - camera.z),
      );
      for (const collider of camp) {
        expect(
          overlaps(coveredBearings(collider, camera.x, camera.z), {
            from: centre - half,
            to: centre + half,
          }),
          `${portal.slug} behind ${JSON.stringify(collider)}`,
        ).toBe(false);
      }
    }
  });

  it('leaves the first walk to every portal open, today’s and nine future ones', () => {
    for (const portal of [...placed, ...nine]) {
      expect(walkClearance(0, 0, portal.x, portal.z, camp)).toBeGreaterThan(PLAYER_RADIUS);
    }
  });

  it('keeps both ways round the monument to the 404 signpost open', () => {
    const [approachX, approachZ] = LICHTUNG_SIGNPOST_APPROACH;

    for (const side of [-1, 1]) {
      const bendX = side * 5;
      const bendZ = 9;
      expect(walkClearance(0, 0, bendX, bendZ, camp)).toBeGreaterThan(PLAYER_RADIUS);
      expect(walkClearance(bendX, bendZ, approachX, approachZ, camp)).toBeGreaterThan(
        PLAYER_RADIUS,
      );
    }
    expect(
      clearance(LICHTUNG_SIGNPOST_POSITION[0], LICHTUNG_SIGNPOST_POSITION[2], camp),
    ).toBeGreaterThan(10);
  });
});

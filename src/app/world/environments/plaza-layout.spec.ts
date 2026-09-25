import { PLAYER_RADIUS } from '@engine/player/player-controller';
import { clearance } from './testing/clearance';
import { PlazaEnvironment } from './plaza';
import {
  FACADE,
  GLIDE_RADIUS,
  HOUSE_DEPTH,
  PORTAL_STAND,
  STATIONS,
  rowWidths,
  houseRow,
  plazaGlidePath,
} from './plaza-layout';
import { seededRandom } from './random';

const ARRIVAL = { x: 0, z: 13.5 };
const length = (path: readonly { x: number; z: number }[]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0);
const samples = (path: readonly { x: number; z: number }[], every = 0.25) =>
  path.slice(1).flatMap((p, i) => {
    const q = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.z - q.z) / every));
    return Array.from({ length: n + 1 }, (_, k) => ({
      x: q.x + ((p.x - q.x) * k) / n,
      z: q.z + ((p.z - q.z) * k) / n,
    }));
  });

describe('Plaza layout', () => {
  it('fills a row exactly, stretching only the last house and by at most 10 %', () => {
    for (const seed of [1, 2, 3, 81, 82]) {
      for (const run of [36, 15]) {
        const { widths, stretch } = rowWidths(run, seededRandom(seed));
        const total = widths.slice(0, -1).reduce((a, b) => a + b, 0) + widths.at(-1)! * stretch;
        expect(total).toBeCloseTo(run, 6);
        expect(stretch).toBeGreaterThanOrEqual(1);
        expect(stretch).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('closes three sides and leaves the street open on the south only', () => {
    const covered = (spots: ReturnType<typeof houseRow>, along: number) =>
      spots.some(
        (s) =>
          Math.abs((s.rotationY === 0 || s.rotationY === Math.PI ? s.x : s.z) - along) <
          s.options.width / 2,
      );
    expect(covered(houseRow('north', 81, false), 0)).toBe(true);
    expect(covered(houseRow('south', 82, true), 0)).toBe(false);
    expect(covered(houseRow('south', 82, true), 5)).toBe(true);
  });

  it('keeps every collider inside ±(FACADE + HOUSE_DEPTH)', () => {
    const bound = FACADE + HOUSE_DEPTH + 1e-6;
    for (const c of new PlazaEnvironment({ reducedMotion: () => false }).colliders) {
      const [minX, maxX, minZ, maxZ] =
        c.kind === 'aabb'
          ? [c.minX, c.maxX, c.minZ, c.maxZ]
          : [c.x - c.radius, c.x + c.radius, c.z - c.radius, c.z + c.radius];
      expect(Math.min(minX, minZ)).toBeGreaterThanOrEqual(-bound);
      expect(Math.max(maxX, maxZ)).toBeLessThanOrEqual(bound);
    }
  });

  it('keeps the glide circle free of colliders', () => {
    const { colliders } = new PlazaEnvironment({ reducedMotion: () => false });
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const gap = clearance(Math.cos(a) * GLIDE_RADIUS, Math.sin(a) * GLIDE_RADIUS, colliders);
      expect(gap).toBeGreaterThan(PLAYER_RADIUS + 0.5);
    }
  });

  it.each(STATIONS.map((s) => [s.key, s] as const))(
    'glides from the arrival to station %i clear of every collider',
    (_key, station) => {
      const { colliders } = new PlazaEnvironment({ reducedMotion: () => false });
      const path = plazaGlidePath(ARRIVAL, station.stand);
      expect(path.at(-1)).toEqual({ x: station.stand.x, z: station.stand.z });
      expect(length(path)).toBeLessThanOrEqual(25);
      for (const p of samples(path)) {
        expect(clearance(p.x, p.z, colliders)).toBeGreaterThan(PLAYER_RADIUS + 0.5);
      }
    },
  );

  it('keeps the straight walk from the arrival to every stand within 21 m', () => {
    for (const s of STATIONS) {
      expect(Math.hypot(s.stand.x - ARRIVAL.x, s.stand.z - ARRIVAL.z)).toBeLessThanOrEqual(21);
    }
  });

  it('takes the shorter arc', () => {
    const path = plazaGlidePath(STATIONS[0].stand, STATIONS[3].stand); // SW → SE passes south, not north
    expect(Math.max(...path.map((p) => p.z))).toBeGreaterThan(7.9);
    expect(Math.min(...path.map((p) => p.z))).toBeGreaterThan(0);
  });

  it('does not produce NaN from the centre or for a glide to where the player stands', () => {
    for (const p of plazaGlidePath({ x: 0, z: 0 }, STATIONS[1].stand)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
    expect(plazaGlidePath(STATIONS[1].stand, STATIONS[1].stand)).toHaveLength(1);
  });

  it('reaches the portal stand off the circle through the south point', () => {
    const path = plazaGlidePath(STATIONS[1].stand, PORTAL_STAND);
    expect(path.at(-1)).toEqual({ x: 0, z: 15.5 });
    expect(path.at(-2)!.x).toBeCloseTo(0, 5);
    expect(path.at(-2)!.z).toBeCloseTo(GLIDE_RADIUS, 5);
  });

  it('never leads into the fountain from inside the circle', () => {
    const path = plazaGlidePath({ x: 0.5, z: 4.2 }, STATIONS[1].stand);
    for (const p of samples(path)) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(3.2 + PLAYER_RADIUS);
    }
  });
});

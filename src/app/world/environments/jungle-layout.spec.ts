import { Vector3 } from 'three';
import { PLAYER_RADIUS, WALK_SPEED } from '@engine/player/player-controller';
import {
  ARCH,
  ARCH_TRIGGER,
  BAMBOO,
  BRIDGE,
  BRIDGE_NORTH,
  BRIDGE_SOUTH,
  CAIRNS,
  CARD_OFFSET,
  CARD_SLOTS,
  CAVE_SLOT,
  EXHIBIT,
  HANG,
  LANTERN_OFFSET,
  LANTERN_POST,
  LANTERN_YAW,
  LIANA,
  MAP_SCALE,
  NORTH_TRAIL,
  PATHS,
  POOL,
  RIDGE,
  SOUTH_TRAIL,
  SPAWN,
  STELE,
  STREAM,
  Slot,
  TAG_SLOTS,
  VINE_SLOTS,
  WALL_SLOT,
  arrivalToArch,
  jungleHeightAt,
  mapToWorld,
  nearestOnPath,
  onSouthBank,
  streamCentreZ,
  underArch,
} from './jungle-layout';

/** Whether a slot's front turns towards (x, z) rather than away from it. */
function faces(place: Slot, x: number, z: number): boolean {
  const dx = x - place.position.x;
  const dz = z - place.position.z;
  return Math.sin(place.yaw) * dx + Math.cos(place.yaw) * dz > 0;
}

/** Metres from a point to the nearest walked line. */
function offTrail(point: Vector3): number {
  return Math.min(...PATHS.map((path) => nearestOnPath(point.x, point.z, path).distance));
}

describe('jungle layout', () => {
  describe('mapToWorld', () => {
    it('puts the map’s plunge pool on the world’s', () => {
      const pool = mapToWorld(530, 88);

      expect(pool.x).toBeCloseTo(POOL.x, 10);
      expect(pool.z).toBeCloseTo(POOL.z, 10);
      expect(pool.y).toBe(0);
    });

    it('scales both axes by the same metres per pixel, the map’s y running south as z does', () => {
      const origin = mapToWorld(530, 88);
      const east = mapToWorld(630, 88);
      const south = mapToWorld(530, 188);

      expect(east.x - origin.x).toBeCloseTo(100 * MAP_SCALE, 10);
      expect(east.z).toBeCloseTo(origin.z, 10);
      expect(south.z - origin.z).toBeCloseTo(100 * MAP_SCALE, 10);
      expect(south.x).toBeCloseTo(origin.x, 10);
    });

    it('is pure: every call hands out a fresh vector', () => {
      const first = mapToWorld(490, 672);
      first.x = 1000;

      expect(mapToWorld(490, 672).x).not.toBe(1000);
    });
  });

  it('takes 15 to 20 seconds to walk from the arrival to the arch', () => {
    const seconds = arrivalToArch() / WALK_SPEED;

    expect(seconds).toBeGreaterThanOrEqual(15);
    expect(seconds).toBeLessThanOrEqual(20);
  });

  it('starts the south trail at the arrival and ends it on the bridge’s south end', () => {
    expect(SPAWN.position.distanceTo(SOUTH_TRAIL[0])).toBe(0);
    expect(SOUTH_TRAIL[SOUTH_TRAIL.length - 1]).toBe(BRIDGE_SOUTH);
    expect(NORTH_TRAIL[0]).toBe(BRIDGE_NORTH);
    // The arrival faces along the trail's first leg.
    expect(faces(SPAWN, SOUTH_TRAIL[1].x, SOUTH_TRAIL[1].z)).toBe(true);
  });

  it('spans the stream square with the bridge, both ends on dry ground past the stream’s band', () => {
    expect(BRIDGE.yaw).toBe(0);
    expect(streamCentreZ(BRIDGE.centre.x)).toBeCloseTo(BRIDGE.centre.z, 10);
    // Straight under the whole deck, so its sides meet the stream square on.
    for (let x = -BRIDGE.halfWidth; x <= BRIDGE.halfWidth; x += 0.25) {
      expect(streamCentreZ(BRIDGE.centre.x + x)).toBeCloseTo(BRIDGE.centre.z, 10);
    }
    expect(BRIDGE.halfLength).toBeGreaterThan(STREAM.band + 1);
    expect(onSouthBank(BRIDGE_SOUTH.x, BRIDGE_SOUTH.z)).toBe(true);
    expect(onSouthBank(BRIDGE_NORTH.x, BRIDGE_NORTH.z)).toBe(false);
  });

  it('stands the arch on the deck’s middle, inside its own trigger', () => {
    expect(ARCH.x).toBe(BRIDGE.centre.x);
    expect(ARCH.z).toBe(BRIDGE.centre.z);
    expect(ARCH.y).toBe(BRIDGE.deckHeight);
    expect(underArch(ARCH.x, ARCH.z)).toBe(true);
    // The map's `y < 326`: 9 px short of the arch towards the arrival, nothing further south.
    expect(ARCH_TRIGGER.maxZ - ARCH.z).toBeCloseTo(9 * MAP_SCALE, 10);
    expect(underArch(ARCH.x, ARCH_TRIGGER.maxZ + 0.1)).toBe(false);
    // On the deck only, never beside it over the water.
    expect(underArch(BRIDGE.centre.x + BRIDGE.halfWidth + 0.1, ARCH.z)).toBe(false);
    expect(ARCH_TRIGGER.minZ).toBeCloseTo(BRIDGE_NORTH.z, 10);
  });

  it('keeps the arrival’s things on the south bank and the destination’s on the north', () => {
    const south: [string, Vector3][] = [
      ['lantern', LANTERN_POST],
      ['stele', STELE.position],
      ['bamboo', BAMBOO.position],
      ['cairns', CAIRNS.position],
      ...SOUTH_TRAIL.map((point, i) => [`south trail ${i}`, point] as [string, Vector3]),
      ...CARD_SLOTS.map((card, i) => [`card ${i}`, card.position] as [string, Vector3]),
    ];
    const north: [string, Vector3][] = [
      ['exhibit', EXHIBIT.position],
      ['wall', WALL_SLOT.position],
      ['liana', LIANA.position],
      ['cave', CAVE_SLOT],
      ...NORTH_TRAIL.map((point, i) => [`north trail ${i}`, point] as [string, Vector3]),
    ];

    for (const [name, point] of south) {
      expect(onSouthBank(point.x, point.z), name).toBe(true);
    }
    for (const [name, point] of north) {
      expect(onSouthBank(point.x, point.z), name).toBe(false);
    }
  });

  it('keeps everything that stands off the stream, well clear of the water', () => {
    const standing = [
      LANTERN_POST,
      STELE.position,
      BAMBOO.position,
      CAIRNS.position,
      EXHIBIT.position,
      WALL_SLOT.position,
      LIANA.position,
      ...CARD_SLOTS.map((card) => card.position),
    ];
    for (const point of standing) {
      expect(Math.abs(point.z - streamCentreZ(point.x))).toBeGreaterThan(STREAM.band + 2);
    }
  });

  it('stands four feed cards beside the south trail, each turned to the visitor coming along it', () => {
    expect(CARD_SLOTS).toHaveLength(4);
    for (const card of CARD_SLOTS) {
      const nearest = nearestOnPath(card.position.x, card.position.z, SOUTH_TRAIL);
      expect(nearest.distance).toBeCloseTo(CARD_OFFSET, 5);
      expect(faces(card, nearest.point.x, nearest.point.z)).toBe(true);
    }
    // In the map's order: the arrival passes them first to last.
    const along = CARD_SLOTS.map(
      (card) => nearestOnPath(card.position.x, card.position.z, SOUTH_TRAIL).along,
    );
    expect([...along].sort((a, b) => a - b)).toEqual(along);
  });

  it('hangs fifteen vines, twelve over the south trail and three on the north bank', () => {
    expect(VINE_SLOTS).toHaveLength(15);
    const south = VINE_SLOTS.filter(({ position }) => onSouthBank(position.x, position.z));
    expect(south).toHaveLength(12);
    for (const vine of VINE_SLOTS) {
      expect(vine.radius).toBeGreaterThanOrEqual(12 * MAP_SCALE);
      expect(vine.radius).toBeLessThanOrEqual(20 * MAP_SCALE);
    }
  });

  it('hangs fifteen tags, the four canonical ones first, each turned to the trail', () => {
    expect(TAG_SLOTS).toHaveLength(15);
    const canonical = [
      [412, 592],
      [398, 522],
      [458, 462],
      [512, 404],
    ].map(([x, y]) => mapToWorld(x, y));
    // At the map's spot, or brought in straight towards the trail until 2.3 m off it.
    canonical.forEach((point, i) => {
      const tag = TAG_SLOTS[i].position;
      const mapped = offTrail(point);
      const hung = offTrail(tag);
      expect(hung).toBeLessThanOrEqual(Math.min(mapped, 2.3) + 1e-9);
      expect(Math.hypot(tag.x - point.x, tag.z - point.z)).toBeCloseTo(mapped - hung, 6);
    });
    for (const tag of TAG_SLOTS.slice(4)) {
      expect(
        VINE_SLOTS.some(({ position }) => position.distanceTo(tag.position) < 1e-9),
        'every further tag hangs in a vine',
      ).toBe(true);
    }
  });

  it('stands the lantern beside the first leg, its arm reaching over the walk', () => {
    expect(offTrail(LANTERN_POST)).toBeCloseTo(LANTERN_OFFSET, 6);
    expect(LANTERN_OFFSET).toBeLessThan(2.2 - PLAYER_RADIUS);
    const nearest = nearestOnPath(LANTERN_POST.x, LANTERN_POST.z, SOUTH_TRAIL);
    expect(nearest.along).toBeLessThan(SOUTH_TRAIL[0].distanceTo(SOUTH_TRAIL[1]));
    // The arm is the model's −X: (−cos yaw, sin yaw) in the world, pointing back at the trail.
    const toTrail = nearest.point.clone().sub(LANTERN_POST).normalize();
    expect(-Math.cos(LANTERN_YAW)).toBeCloseTo(toTrail.x, 6);
    expect(Math.sin(LANTERN_YAW)).toBeCloseTo(toTrail.z, 6);
  });

  it('brings the toys and the vines in from the map’s far spots to where the walk passes them', () => {
    expect(offTrail(STELE.position)).toBeLessThanOrEqual(5 + 1e-9);
    expect(offTrail(LIANA.position)).toBeLessThanOrEqual(4 + 1e-9);
    expect(offTrail(BAMBOO.position)).toBeLessThanOrEqual(6.5 + 1e-9);
    expect(offTrail(CAIRNS.position)).toBeLessThanOrEqual(6.5 + 1e-9);
    for (const vine of VINE_SLOTS) {
      expect(offTrail(vine.position)).toBeLessThanOrEqual(3 + 1e-9);
    }
    // Each still on its map side: the stele by the bridge head, bamboo east, cairns west.
    expect(STELE.position.distanceTo(BRIDGE_SOUTH)).toBeLessThan(8);
    expect(BAMBOO.position.x).toBeGreaterThan(
      nearestOnPath(BAMBOO.position.x, BAMBOO.position.z, SOUTH_TRAIL).point.x,
    );
    expect(CAIRNS.position.x).toBeLessThan(
      nearestOnPath(CAIRNS.position.x, CAIRNS.position.z, SOUTH_TRAIL).point.x,
    );
  });

  it('hangs every vine and tag from the canopy line, 5.6 to 6.8 m over the ground below it', () => {
    for (const { position } of [...VINE_SLOTS, ...TAG_SLOTS]) {
      const above = position.y - jungleHeightAt(position.x, position.z);
      expect(above).toBeGreaterThanOrEqual(HANG.min);
      expect(above).toBeLessThanOrEqual(HANG.max);
    }
    expect(HANG).toEqual({ min: 5.6, max: 6.8 });
  });

  it('hangs the tags over the south trail, where the arrival walks under them', () => {
    const south = TAG_SLOTS.filter(({ position }) => onSouthBank(position.x, position.z));
    expect(south.length).toBeGreaterThanOrEqual(12);
    for (const tag of TAG_SLOTS.slice(0, 4)) {
      expect(nearestOnPath(tag.position.x, tag.position.z, SOUTH_TRAIL).distance).toBeLessThan(4);
    }
  });

  it('turns the exhibit to the bridge and the wall to the north trail', () => {
    expect(faces(EXHIBIT, BRIDGE_NORTH.x, BRIDGE_NORTH.z)).toBe(true);
    expect(faces(WALL_SLOT, NORTH_TRAIL[1].x, NORTH_TRAIL[1].z)).toBe(true);
  });

  it('lays the commit ridge along a leg of the south trail', () => {
    expect(SOUTH_TRAIL).toContain(RIDGE.from);
    expect(SOUTH_TRAIL).toContain(RIDGE.to);
    expect(RIDGE.from.distanceTo(RIDGE.to)).toBeGreaterThan(20);
  });

  it('freezes every anchor, so no consumer can move the layout for everyone else', () => {
    expect(Object.isFrozen(LANTERN_POST)).toBe(true);
    expect(Object.isFrozen(SOUTH_TRAIL[1])).toBe(true);
    expect(Object.isFrozen(CARD_SLOTS[0].position)).toBe(true);
    expect(Object.isFrozen(BRIDGE.centre)).toBe(true);
  });
});

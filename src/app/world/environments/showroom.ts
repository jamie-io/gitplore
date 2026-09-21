import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
import { assemble, paint } from './flora';
import { ProceduralGround } from './ground';
import { LightPools, LightPoolsOptions } from './light-pools';
import { GALERIE, applyMood, clearMood } from './mood';
import { MIN_LANDMARK_SEPARATION, Position, clearOf } from './placement';
import { ReflectiveFloor } from './reflective-floor';
import { SharedUniforms } from './shaders/shared-uniforms';
import { withTiles } from './shaders/tiles';
import { withWallWash } from './shaders/wall-wash';
import { Sun } from './sun';
import { Door } from './props/door';
import { HiddenPlace } from './props/hidden-place';

/** Half the hall's floor, in metres. */
export const HALF = 24;
export const WALL_HEIGHT = 7;
const WALL_THICKNESS = 0.8;
/** How far from the back wall the exhibits stand. */
const EXHIBIT_DEPTH = HALF - 7;
/** Pilasters every this many metres along each wall. */
const PILASTER_SPACING = 6;
/** How far a pilaster stands proud of its wall: too little to catch a visitor, enough for a shadow line. */
const PILASTER_DEPTH = 0.12;
/** Where the skylight strips run across the hall, along X; T26 lays light pools under them. */
export const SKYLIGHT_ROWS = [-12, 0, 12] as const;
const SKYLIGHT_WIDTH = 1.6;
/** The two track rails either side of the exhibit row, and the spots hung from them. */
export const TRACK_ROWS = [-EXHIBIT_DEPTH + 3, -EXHIBIT_DEPTH - 3] as const;
export const TRACK_SPOTS = [-15, -10, -5, 0, 5, 10, 15] as const;
export const TRACK_HEIGHT = WALL_HEIGHT - 0.4;
/**
 * Below this height nothing but the floor may stand away from the walls: the bespoke scenes
 * furnish the room relative to the exhibit, and anything of ours in there would collide with it.
 */
export const INTERIOR_CEILING = 6.2;

const FLOOR = 0x2b3038;
/** Polished concrete: dark slabs close in value, so the floor reads as one surface, not a grid. */
const SLABS = [0x2e3033, 0x2b2d30, 0x313336, 0x2c2e32] as const;
const JOINT = 0x1b1e22;
/** The light the fixtures give: the skylight strips, the spot lenses, the pools and the wash. */
const FIXTURE_LIGHT = 0xfff4e4;
/** Pools along each skylight strip: this many, this far apart, this wide. */
const SKYLIGHT_POOLS = [-16, -8, 0, 8, 16] as const;
const SKYLIGHT_POOL_RADIUS = 3.4;
const SPOT_POOL_RADIUS = 1.5;
/** How far below the rail a spot's lens sits along its own axis, as `glowGeometry` builds it. */
const LENS_DROP = 0.33;
const WALL = 0xe9e6e1;
const PILASTER = 0xdedad3;
const TRIM = 0x2b3038;
const CEILING = 0xf1efeb;
const FITTING = 0x1d2127;
const DOOR_X = 16;
const DOOR_Z = -24.4;
const BACK_ROOM_Z = -26.2;
const DOOR_OPENING_HALF = 1;
const DOOR_HEIGHT = 2.2;

/** Spots on the rail in front of the exhibits tip back towards them, and the ones behind tip forward. */
function spotTilt(row: number): number {
  return row > -EXHIBIT_DEPTH ? 0.6 : -0.6;
}

/** Where a spot's beam meets the floor: its lens, carried down its tilted axis to y = 0. */
function spotFloorZ(row: number): number {
  const tilt = spotTilt(row);
  const lensY = TRACK_HEIGHT - LENS_DROP * Math.cos(tilt);
  const lensZ = row - LENS_DROP * Math.sin(tilt);
  return lensZ - Math.tan(tilt) * lensY;
}

/** A soft pool under every skylight strip, several per strip, and one where each spot lands. */
function poolLayout(): LightPoolsOptions['pools'] {
  const pools: { x: number; z: number; radius: number }[] = [];
  for (const z of SKYLIGHT_ROWS) {
    for (const x of SKYLIGHT_POOLS) {
      pools.push({ x, z, radius: SKYLIGHT_POOL_RADIUS });
    }
  }
  for (const row of TRACK_ROWS) {
    const z = spotFloorZ(row);
    for (const x of TRACK_SPOTS) {
      pools.push({ x, z, radius: SPOT_POOL_RADIUS });
    }
  }
  return pools;
}

/** Pilasters, skirting, rails and spot bodies: every dark or off-white fitting, one mesh. */
function trimGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const inner = HALF - WALL_THICKNESS / 2 - PILASTER_DEPTH / 2;

  for (let along = -HALF + PILASTER_SPACING / 2; along < HALF; along += PILASTER_SPACING) {
    parts.push(
      paint(
        new BoxGeometry(0.7, WALL_HEIGHT, PILASTER_DEPTH).translate(along, WALL_HEIGHT / 2, -inner),
        PILASTER,
      ),
    );
    parts.push(
      paint(
        new BoxGeometry(0.7, WALL_HEIGHT, PILASTER_DEPTH).translate(along, WALL_HEIGHT / 2, inner),
        PILASTER,
      ),
    );
    parts.push(
      paint(
        new BoxGeometry(PILASTER_DEPTH, WALL_HEIGHT, 0.7).translate(-inner, WALL_HEIGHT / 2, along),
        PILASTER,
      ),
    );
    parts.push(
      paint(
        new BoxGeometry(PILASTER_DEPTH, WALL_HEIGHT, 0.7).translate(inner, WALL_HEIGHT / 2, along),
        PILASTER,
      ),
    );
  }

  const skirt = 0.04;
  parts.push(
    paint(new BoxGeometry(HALF * 2, 0.14, skirt).translate(0, 0.07, -HALF + skirt / 2), TRIM),
  );
  parts.push(
    paint(new BoxGeometry(HALF * 2, 0.14, skirt).translate(0, 0.07, HALF - skirt / 2), TRIM),
  );
  parts.push(
    paint(new BoxGeometry(skirt, 0.14, HALF * 2).translate(-HALF + skirt / 2, 0.07, 0), TRIM),
  );
  parts.push(
    paint(new BoxGeometry(skirt, 0.14, HALF * 2).translate(HALF - skirt / 2, 0.07, 0), TRIM),
  );

  for (const row of TRACK_ROWS) {
    parts.push(paint(new BoxGeometry(34, 0.06, 0.06).translate(0, TRACK_HEIGHT, row), FITTING));
    for (const x of TRACK_SPOTS) {
      const can = new CylinderGeometry(0.09, 0.12, 0.28, 8)
        .translate(0, -0.18, 0)
        .rotateX(spotTilt(row))
        .translate(x, TRACK_HEIGHT, row);
      parts.push(paint(can, FITTING));
    }
  }

  return assemble(parts);
}

/** Skylight strips and spot lenses: everything that glows, one emissive mesh. */
function glowGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = SKYLIGHT_ROWS.map((row) =>
    paint(
      new PlaneGeometry(HALF * 2 - 6, SKYLIGHT_WIDTH)
        .rotateX(Math.PI / 2)
        .translate(0, WALL_HEIGHT - 0.01, row),
      0xffffff,
    ),
  );
  for (const row of TRACK_ROWS) {
    for (const x of TRACK_SPOTS) {
      const lens = new CylinderGeometry(0.085, 0.085, 0.02, 8)
        .translate(0, -0.33, 0)
        .rotateX(spotTilt(row))
        .translate(x, TRACK_HEIGHT, row);
      parts.push(paint(lens, 0xffffff));
    }
  }
  return assemble(parts);
}

/**
 * The world a repository nobody has styled yet leads to, and the hall three bespoke scenes
 * furnish: a closed gallery with skylights, pilasters and track lights. Everything it adds stands
 * against the walls or overhead; the floor between them belongs to the projects.
 */
export class ShowroomEnvironment implements Environment {
  readonly id = 'showroom' as const;
  readonly name = 'Showroom';
  /** Three metres beyond arrival, leaving a 22 m walk to the hall's first exhibit. */
  readonly spawn = new Vector3(0, 0, 8);
  /** Yaw 0 looks down −Z: into the hall, at the exhibit wall. */
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[];
  readonly door: Door;
  readonly backRoom: HiddenPlace;
  readonly interactables: readonly Interactable[];
  /** The light and air of this place; the scene reads it to match whatever stands in it. */
  readonly mood = GALERIE;
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(GALERIE);

  private floorDetail: 0 | 1 | 2 = 0;
  private readonly floor = new ProceduralGround({
    id: 'showroom-floor',
    size: HALF * 2,
    color: FLOOR,
    segments: 1,
    heightAt: () => 0,
    decorate: (material) => {
      material.roughness = 0.3;
      withTiles(material, {
        size: 1,
        grout: 0.008,
        groutColour: JOINT,
        colours: SLABS,
        pattern: 'slab',
        roughness: { min: 0.25, max: 0.4 },
        detail: this.floorDetail,
      });
    },
  });
  private readonly reflection = new ReflectiveFloor({
    size: (HALF - WALL_THICKNESS / 2) * 2,
    strength: 0.3,
    roughness: 0.28,
  });
  private readonly pools = new LightPools({
    pools: poolLayout(),
    colour: FIXTURE_LIGHT,
    intensity: 0.12,
  });
  private readonly sun = new Sun({ mood: GALERIE, shared: this.shared });
  private readonly added: Object3D[] = [];
  private readonly lintelCollider: Extract<Collider, { kind: 'aabb' }> & { enabled: boolean };
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {
    this.colliders = [
      {
        kind: 'aabb',
        minX: -HALF,
        maxX: DOOR_X - DOOR_OPENING_HALF,
        minZ: -HALF - WALL_THICKNESS,
        maxZ: -HALF,
      },
      {
        kind: 'aabb',
        minX: DOOR_X + DOOR_OPENING_HALF,
        maxX: HALF,
        minZ: -HALF - WALL_THICKNESS,
        maxZ: -HALF,
      },
      { kind: 'aabb', minX: -HALF, maxX: HALF, minZ: HALF, maxZ: HALF + WALL_THICKNESS },
      { kind: 'aabb', minX: -HALF - WALL_THICKNESS, maxX: -HALF, minZ: -HALF, maxZ: HALF },
      { kind: 'aabb', minX: HALF, maxX: HALF + WALL_THICKNESS, minZ: -HALF, maxZ: HALF },
    ];
    this.lintelCollider = {
      kind: 'aabb',
      minX: DOOR_X - DOOR_OPENING_HALF,
      maxX: DOOR_X + DOOR_OPENING_HALF,
      minZ: -HALF - WALL_THICKNESS,
      maxZ: -HALF,
      enabled: true,
    };
    this.door = new Door({
      id: 'showroom:back-room-door',
      position: new Vector3(DOOR_X, 0, DOOR_Z),
      ground: this.floor,
      reducedMotion: options.reducedMotion,
    });
    this.backRoom = new HiddenPlace({
      id: 'showroom:back-room',
      position: new Vector3(DOOR_X, 0, BACK_ROOM_Z),
      ground: this.floor,
      thing: new Object3D(),
    });
    this.interactables = [...this.door.interactables, ...this.backRoom.interactables];
    this.colliders = [
      ...this.colliders,
      this.lintelCollider,
      ...this.door.colliders,
      ...this.backRoom.colliders,
    ];
  }

  get ground() {
    return this.floor;
  }

  /** A straight row along the back wall, every exhibit turned towards the arriving visitor. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const spacing = Math.max(MIN_LANDMARK_SEPARATION, (HALF * 2 - 8) / Math.max(slots, 1));
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => ({
      position: [(index - (slots - 1) / 2) * spacing, 0, -EXHIBIT_DEPTH] as const,
      rotationY: 0,
    }));

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, GALERIE);
    ctx.scene.background = new Color(GALERIE.sky.horizon);
    const shadows = ctx.quality.shadows;

    this.floorDetail = ctx.quality.shaderDetail;
    this.floor.init(ctx);
    this.reflection.init(ctx);
    this.pools.init(ctx);
    this.sun.init(ctx);

    const wash = { top: WALL_HEIGHT, colour: FIXTURE_LIGHT, strength: 0.35 };
    const wall = withWallWash(
      new MeshStandardMaterial({ color: WALL, roughness: 0.85, metalness: 0 }),
      wash,
    );
    const spans: readonly [number, number, number, number][] = [
      [(-HALF + DOOR_X - DOOR_OPENING_HALF) / 2, -HALF, HALF + DOOR_X - DOOR_OPENING_HALF, WALL_THICKNESS],
      [(DOOR_X + DOOR_OPENING_HALF + HALF) / 2, -HALF, HALF - DOOR_X - DOOR_OPENING_HALF, WALL_THICKNESS],
      [0, HALF, HALF * 2, WALL_THICKNESS],
      [-HALF, 0, WALL_THICKNESS, HALF * 2],
      [HALF, 0, WALL_THICKNESS, HALF * 2],
    ];
    for (const [x, z, width, depth] of spans) {
      const mesh = new Mesh(new BoxGeometry(width, WALL_HEIGHT, depth), wall);
      mesh.name = 'wall';
      mesh.position.set(x, WALL_HEIGHT / 2, z);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      this.added.push(mesh);
    }

    const lintel = new Mesh(
      new BoxGeometry(DOOR_OPENING_HALF * 2, WALL_HEIGHT - DOOR_HEIGHT, WALL_THICKNESS),
      wall,
    );
    lintel.name = 'showroom:back-room-lintel';
    lintel.position.set(DOOR_X, DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2, -HALF);
    lintel.castShadow = shadows;
    lintel.receiveShadow = shadows;
    this.added.push(lintel);

    // The ceiling never casts: the sun lights the hall "through the skylights", which a closed
    // shadow-casting lid would block entirely.
    const ceiling = new Mesh(
      new BoxGeometry(HALF * 2 + WALL_THICKNESS * 2, 0.4, HALF * 2 + WALL_THICKNESS * 2),
      // Lit from below by the strips and the washed walls, which no light in the loop models. The
      // wash is flat at the ceiling's height, so it goes in as the plain emissive term: the same
      // light as `withWallWash` would give, with no patch for the software renderer to run.
      new MeshStandardMaterial({
        color: CEILING,
        roughness: 0.9,
        metalness: 0,
        emissive: new Color(CEILING).multiply(new Color(FIXTURE_LIGHT)).multiplyScalar(0.25),
      }),
    );
    ceiling.name = 'ceiling';
    ceiling.position.y = WALL_HEIGHT + 0.2;
    this.added.push(ceiling);

    const trim = new Mesh(
      trimGeometry(),
      withWallWash(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }),
        wash,
      ),
    );
    trim.name = 'trim';
    trim.castShadow = shadows;
    trim.receiveShadow = shadows;
    this.added.push(trim);

    const glow = new Mesh(
      glowGeometry(),
      new MeshStandardMaterial({
        color: 0x000000,
        emissive: FIXTURE_LIGHT,
        emissiveIntensity: 1.6,
      }),
    );
    glow.name = 'fittings-glow';
    this.added.push(glow);

    const roomFloor = new Mesh(
      new BoxGeometry(5.2, 0.04, 4.2),
      new MeshStandardMaterial({ color: FLOOR, roughness: 0.3 }),
    );
    roomFloor.name = 'showroom:back-room-floor';
    roomFloor.position.set(DOOR_X, -0.02, BACK_ROOM_Z);
    this.added.push(roomFloor);

    this.added.forEach((object) => ctx.scene.add(object));
    this.door.init(ctx);
    this.backRoom.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.sun.update(dt, ctx);
    this.door.update(dt, ctx);
    this.lintelCollider.enabled = !this.door.open;
    this.backRoom.update();
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.door.dispose();
    this.backRoom.dispose();
    this.sun.dispose();
    this.pools.dispose();
    this.reflection.dispose();
    this.floor.dispose();
    if (this.scene) {
      this.scene.background = null;
      clearMood(this.scene);
      this.scene = null;
    }
  }
}

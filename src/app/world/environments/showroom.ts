import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Anchor, Environment } from './environment';
import { ProceduralGround } from './ground';
import { clearOf, MIN_LANDMARK_SEPARATION, Position } from './placement';
import type { EnvironmentOptions } from './create-environment';

/** Half the hall's floor, in metres. */
const HALF = 24;
const WALL_HEIGHT = 7;
const WALL_THICKNESS = 0.8;
/** How far from the back wall the exhibits stand. */
const EXHIBIT_DEPTH = HALF - 7;

const FLOOR = 0x2b3038;
const WALL = 0xdfe3e8;

/**
 * The world a repository nobody has styled yet leads to (spec §4's `environment` default): a plain,
 * well-lit hall. It carries no story of its own, so the project's screenshot is the only thing in
 * it with a colour, which is exactly what a neutral default should do.
 */
export class ShowroomEnvironment implements Environment {
  readonly id = 'showroom' as const;
  readonly name = 'Showroom';
  readonly spawn = new Vector3(0, 0, HALF - 6);
  /** Yaw 0 looks down −Z: into the hall, at the exhibit wall. */
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[];

  private readonly floor = new ProceduralGround({
    id: 'showroom-floor',
    size: HALF * 2,
    color: FLOOR,
    segments: 1,
    heightAt: () => 0,
  });
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(options: EnvironmentOptions) {
    void options;
    this.colliders = [
      { kind: 'aabb', minX: -HALF, maxX: HALF, minZ: -HALF - WALL_THICKNESS, maxZ: -HALF },
      { kind: 'aabb', minX: -HALF, maxX: HALF, minZ: HALF, maxZ: HALF + WALL_THICKNESS },
      { kind: 'aabb', minX: -HALF - WALL_THICKNESS, maxX: -HALF, minZ: -HALF, maxZ: HALF },
      { kind: 'aabb', minX: HALF, maxX: HALF + WALL_THICKNESS, minZ: -HALF, maxZ: HALF },
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
    ctx.scene.background = new Color(0x10141a);

    this.floor.init(ctx);

    const wall = new MeshStandardMaterial({ color: WALL, roughness: 0.85, metalness: 0 });
    const spans: readonly [number, number, number, number][] = [
      [0, -HALF, HALF * 2, WALL_THICKNESS],
      [0, HALF, HALF * 2, WALL_THICKNESS],
      [-HALF, 0, WALL_THICKNESS, HALF * 2],
      [HALF, 0, WALL_THICKNESS, HALF * 2],
    ];
    for (const [x, z, width, depth] of spans) {
      const mesh = new Mesh(new BoxGeometry(width, WALL_HEIGHT, depth), wall);
      mesh.position.set(x, WALL_HEIGHT / 2, z);
      mesh.receiveShadow = ctx.quality.shadows;
      this.added.push(mesh);
    }

    const ambient = new HemisphereLight(0xffffff, 0x3a4049, 1.4);
    const key = new DirectionalLight(0xfff6e8, 1.5);
    key.position.set(10, 18, 14);
    key.castShadow = ctx.quality.shadows;
    this.added.push(ambient, key);

    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(): void {
    // Nothing in the hall moves.
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.floor.dispose();
    if (this.scene) {
      this.scene.background = null;
      this.scene = null;
    }
  }
}

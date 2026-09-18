import {
  BoxGeometry,
  CylinderGeometry,
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
import { PLAZA, applyMood, clearMood } from './mood';
import { arcAnchors, Position } from './placement';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Sky } from './sky';
import { Sun } from './sun';
import type { EnvironmentOptions } from './create-environment';

const SIZE = 90;
const FOUNTAIN_RADIUS = 4;
const KERB_HEIGHT = 0.5;
/** Radius of the semicircle the exhibits stand on. */
const EXHIBIT_RADIUS = 20;
const EXHIBIT_ARC = Math.PI * 1.1;

/** Open, bright and built: paving, a fountain, and a noon sky of its own. */
export class PlazaEnvironment implements Environment {
  readonly id = 'plaza' as const;
  readonly name = 'Plaza';
  readonly spawn = new Vector3(0, 0, 26);
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[] = [
    { kind: 'cylinder', x: 0, z: 0, radius: FOUNTAIN_RADIUS + 0.4 },
  ];
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(PLAZA);

  private readonly floor = new ProceduralGround({
    id: 'plaza-floor',
    size: SIZE,
    color: 0xb9b2a4,
    segments: 1,
    heightAt: () => 0,
  });
  private readonly sky = new Sky({ mood: PLAZA, shared: this.shared });
  private readonly sun = new Sun({ mood: PLAZA, shared: this.shared });
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {}

  get ground() {
    return this.floor;
  }

  /** A semicircle around the fountain, every exhibit facing the middle of the square. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    return arcAnchors(count, avoid, EXHIBIT_RADIUS, EXHIBIT_ARC);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    applyMood(ctx.scene, PLAZA);
    this.floor.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);

    const stone = new MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9, flatShading: true });
    const water = new MeshStandardMaterial({ color: 0x3f7bb8, roughness: 0.2, metalness: 0.1 });

    const kerb = new Mesh(
      new CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS + 0.3, KERB_HEIGHT, 20),
      stone,
    );
    kerb.position.y = KERB_HEIGHT / 2;
    kerb.receiveShadow = ctx.quality.shadows;

    const pool = new Mesh(
      new CylinderGeometry(FOUNTAIN_RADIUS - 0.4, FOUNTAIN_RADIUS - 0.4, 0.08, 20),
      water,
    );
    pool.position.y = KERB_HEIGHT - 0.02;

    const pillar = new Mesh(new BoxGeometry(1, 3.2, 1), stone);
    pillar.position.y = 1.6;
    pillar.castShadow = ctx.quality.shadows;

    this.added.push(kerb, pool, pillar);
    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.sun.dispose();
    this.sky.dispose();
    this.floor.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }
}

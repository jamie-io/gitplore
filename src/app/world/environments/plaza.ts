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
import { clearOf, Position } from './placement';
import { Sky } from './sky';
import type { EnvironmentOptions } from './create-environment';

const SIZE = 90;
const FOUNTAIN_RADIUS = 4;
const KERB_HEIGHT = 0.5;
/** Radius of the semicircle the exhibits stand on. */
const EXHIBIT_RADIUS = 20;
const EXHIBIT_ARC = Math.PI * 1.1;

/** Open, bright and built: paving, a fountain, and the same sky the clearing has. */
export class PlazaEnvironment implements Environment {
  readonly id = 'plaza' as const;
  readonly name = 'Plaza';
  readonly spawn = new Vector3(0, 0, 26);
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[] = [
    { kind: 'cylinder', x: 0, z: 0, radius: FOUNTAIN_RADIUS + 0.4 },
  ];

  private readonly floor = new ProceduralGround({
    id: 'plaza-floor',
    size: SIZE,
    color: 0xb9b2a4,
    segments: 1,
    heightAt: () => 0,
  });
  private readonly sky: Sky;
  private readonly added: Object3D[] = [];

  constructor(options: EnvironmentOptions) {
    this.sky = new Sky(options);
  }

  get ground() {
    return this.floor;
  }

  /** A semicircle around the fountain, every exhibit facing the middle of the square. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => {
      const t = slots === 1 ? 0.5 : index / (slots - 1);
      const angle = (t - 0.5) * EXHIBIT_ARC;
      const x = Math.sin(angle) * EXHIBIT_RADIUS;
      const z = -Math.cos(angle) * EXHIBIT_RADIUS;
      return { position: [x, 0, z] as const, rotationY: Math.atan2(-x, -z) + Math.PI };
    });

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.floor.init(ctx);
    this.sky.init(ctx);

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

  update(dt: number): void {
    this.sky.update(dt);
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.sky.dispose();
    this.floor.dispose();
  }
}

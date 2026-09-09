import { Vector3 } from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldScene } from '@engine/world-object';
import { Sky } from './sky';
import { Terrain } from './terrain';

/**
 * The world the visitor starts in. It is created once and never destroyed: a project destination is
 * an overlay on top of it (IMPLEMENTATION_PLAN.md §3). Landmarks and props join in M3.
 */
export class HubScene implements WorldScene {
  readonly id = 'hub';

  readonly spawn = new Vector3(0, 0, 0);
  readonly colliders: readonly Collider[] = [];

  private readonly terrain = new Terrain();
  private readonly sky: Sky;

  constructor(options: { readonly reducedMotion: boolean }) {
    this.sky = new Sky(options);
  }

  get ground() {
    return this.terrain;
  }

  init(ctx: WorldContext): void {
    this.terrain.init(ctx);
    this.sky.init(ctx);
  }

  update(dt: number): void {
    this.terrain.update();
    this.sky.update(dt);
  }

  dispose(): void {
    this.sky.dispose();
    this.terrain.dispose();
  }
}

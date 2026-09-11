import { Vector3 } from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { Monument } from './monument';
import { Position, ringPlacements } from './placement';
import { Sky } from './sky';
import { Terrain } from './terrain';
import { Anchor, Environment } from './environment';

/**
 * The open ground the visitor starts on: exactly what `HubScene` used to assemble for itself
 * (spec §5). It is procedural and cheap to rebuild, which is what lets the start world be disposed
 * when the visitor walks through a portal and built again when they come back.
 */
export class ClearingEnvironment implements Environment {
  readonly id = 'clearing' as const;
  readonly name = 'Lichtung';
  readonly spawn = new Vector3(0, 0, 0);
  readonly spawnYaw = 0;

  private readonly terrain = new Terrain();
  private readonly monument = new Monument();
  private readonly sky: Sky;

  constructor(options: { readonly reducedMotion: () => boolean }) {
    this.sky = new Sky(options);
  }

  get ground(): HeightField {
    return this.terrain;
  }

  get colliders(): readonly Collider[] {
    return this.monument.colliders;
  }

  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    return ringPlacements(count, avoid);
  }

  init(ctx: WorldContext): void {
    this.terrain.init(ctx);
    this.sky.init(ctx);
    this.monument.init(ctx);
  }

  update(dt: number): void {
    this.terrain.update();
    this.sky.update(dt);
    this.monument.update();
  }

  dispose(): void {
    this.monument.dispose();
    this.sky.dispose();
    this.terrain.dispose();
  }
}

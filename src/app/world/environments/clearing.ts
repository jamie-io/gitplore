import { Vector3 } from 'three';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import type { EnvironmentOptions } from './create-environment';
import { Anchor, Environment } from './environment';
import { Monument } from './monument';
import { LICHTUNG, applyMood, clearMood } from './mood';
import { Position, ringPlacements } from './placement';
import { SharedUniforms } from './shaders/shared-uniforms';
import { Sky } from './sky';
import { Sun } from './sun';
import { Terrain } from './terrain';

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
  /** Every shader in this world reads these; public so a test can watch time stand still. */
  readonly shared = new SharedUniforms(LICHTUNG);

  private readonly terrain = new Terrain();
  private readonly monument = new Monument();
  private readonly sky = new Sky({ mood: LICHTUNG, shared: this.shared });
  private readonly sun = new Sun({ mood: LICHTUNG, shared: this.shared });
  private scene: WorldContext['scene'] | null = null;

  constructor(private readonly options: EnvironmentOptions) {}

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
    this.scene = ctx.scene;
    applyMood(ctx.scene, LICHTUNG);
    this.terrain.init(ctx);
    this.sky.init(ctx);
    this.sun.init(ctx);
    this.monument.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
    this.terrain.update();
    this.sky.update(dt, ctx);
    this.sun.update(dt, ctx);
    this.monument.update();
  }

  dispose(): void {
    this.monument.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.terrain.dispose();
    if (this.scene) {
      clearMood(this.scene);
      this.scene = null;
    }
  }
}

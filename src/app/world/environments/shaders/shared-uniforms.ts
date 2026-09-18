import { Color, Vector3 } from 'three';
import { Mood, sunDirection } from '../mood';

/**
 * The uniforms every world shader shares, held once per world and handed to each patched material
 * by identity: one `update()` a frame reaches grass, water, motes and the atmosphere alike, and
 * nothing copies values around between them.
 *
 * `time` is the only clock the ambient shaders may read, so freezing it here is what honours
 * `prefers-reduced-motion` for all of them at once.
 */
export class SharedUniforms {
  readonly time = { value: 0 };
  readonly sunDirection: { value: Vector3 };
  readonly sunColor: { value: Color };
  readonly fogColor: { value: Color };
  /** x density at y = 0, y falloff per metre, z sun scatter. */
  readonly heightFog: { value: Vector3 };
  /** x strength, y gust scale, z direction (radians). */
  readonly wind: { value: Vector3 };
  readonly playerPosition = { value: new Vector3() };

  constructor(mood: Mood) {
    const { fog, wind } = mood;
    // `new Color(hex)` converts the mood's sRGB values into the linear working space, which is
    // what every material's uniforms expect.
    this.sunDirection = { value: sunDirection(mood) };
    this.sunColor = { value: new Color(mood.sun.color) };
    this.fogColor = { value: new Color(fog.color) };
    this.heightFog = { value: new Vector3(fog.heightDensity, fog.heightFalloff, fog.sunScatter) };
    this.wind = { value: new Vector3(wind.strength, wind.gustScale, wind.direction) };
  }

  /** Advances `time` unless motion is reduced; tracks the player for grass bending. */
  update(dt: number, player: Vector3, reducedMotion: boolean): void {
    if (!reducedMotion) {
      this.time.value += dt;
    }
    this.playerPosition.value.copy(player);
  }
}

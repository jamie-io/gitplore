import { Color, Vector3 } from 'three';
import { LICHTUNG, sunDirection } from '../mood';
import { SharedUniforms } from './shared-uniforms';

describe('SharedUniforms', () => {
  it('starts from the mood', () => {
    const shared = new SharedUniforms(LICHTUNG);

    expect(shared.time.value).toBe(0);
    expect(shared.sunDirection.value.distanceTo(sunDirection(LICHTUNG))).toBeCloseTo(0, 6);
    expect(shared.sunColor.value.getHex()).toBe(new Color(LICHTUNG.sun.color).getHex());
    expect(shared.fogColor.value.getHex()).toBe(new Color(LICHTUNG.fog.color).getHex());
    expect(shared.heightFog.value.toArray()).toEqual([
      LICHTUNG.fog.heightDensity,
      LICHTUNG.fog.heightFalloff,
      LICHTUNG.fog.sunScatter,
    ]);
    expect(shared.wind.value.toArray()).toEqual([
      LICHTUNG.wind.strength,
      LICHTUNG.wind.gustScale,
      LICHTUNG.wind.direction,
    ]);
  });

  it('advances time by the frame and follows the player', () => {
    const shared = new SharedUniforms(LICHTUNG);

    shared.update(0.5, new Vector3(1, 2, 3), false);
    shared.update(0.25, new Vector3(4, 5, 6), false);

    expect(shared.time.value).toBeCloseTo(0.75, 6);
    expect(shared.playerPosition.value.toArray()).toEqual([4, 5, 6]);
  });

  it('holds time still under reduced motion but still follows the player', () => {
    const shared = new SharedUniforms(LICHTUNG);

    shared.update(0.5, new Vector3(7, 8, 9), true);

    expect(shared.time.value).toBe(0);
    expect(shared.playerPosition.value.toArray()).toEqual([7, 8, 9]);
  });

  it("copies the player position rather than keeping the caller's vector", () => {
    const shared = new SharedUniforms(LICHTUNG);
    const player = new Vector3(1, 1, 1);

    shared.update(0, player, false);
    player.set(9, 9, 9);

    expect(shared.playerPosition.value.toArray()).toEqual([1, 1, 1]);
  });
});

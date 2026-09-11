import { Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { VideoWall, VideoWallOptions } from './video-wall';

function options(overrides: Partial<VideoWallOptions> = {}): VideoWallOptions {
  return {
    origin: new Vector3(0, 0, -20),
    rotationY: 0,
    ground: { heightAt: () => 0 },
    accent: '#8f2f2f',
    reducedMotion: () => true,
    onDemo: () => undefined,
    ...overrides,
  };
}

describe('VideoWall', () => {
  it('parks the visitor in front of the wall, facing it, on enter', () => {
    const target = new VideoWall(options());
    const player = new PlayerController();
    const before = player.position.clone();

    target.enter(player);

    expect(player.position.equals(before)).toBe(false);
    // Front is +Z at rotation 0: the viewpoint stands between the wall (z = -20) and the origin.
    expect(player.position.z).toBeGreaterThan(-20);
    expect(player.position.z).toBeLessThan(0);
    expect(player.yaw).toBe(0);
  });

  it('disposes every card material along with the group, including the flipped one', () => {
    const target = new VideoWall(options());
    const ctx = stubContext();
    target.init(ctx);

    const mesh = ctx.scene.getObjectByName('card:0') as Mesh;
    const slop = mesh.material as MeshBasicMaterial;
    // reducedMotion: true swaps the material immediately, so this captures the other variant.
    target.interact();
    const original = mesh.material as MeshBasicMaterial;
    expect(original).not.toBe(slop);

    const slopDispose = vi.spyOn(slop, 'dispose');
    const originalDispose = vi.spyOn(original, 'dispose');

    target.dispose();

    expect(slopDispose).toHaveBeenCalled();
    expect(originalDispose).toHaveBeenCalled();
    expect(ctx.scene.children).toEqual([]);
  });
});

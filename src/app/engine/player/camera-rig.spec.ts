import { PerspectiveCamera, Vector3 } from 'three';
import { FirstPersonRig } from './camera-rig';
import { PlayerController } from './player-controller';

describe('FirstPersonRig', () => {
  it('puts the camera where the player is', () => {
    const camera = new PerspectiveCamera();
    const player = new PlayerController();
    player.teleport(new Vector3(3, 5, -7));

    new FirstPersonRig(camera).sync(player);

    expect(camera.position.toArray()).toEqual([3, 5, -7]);
  });

  it('applies yaw before pitch so looking up never rolls the view', () => {
    const camera = new PerspectiveCamera();
    const player = new PlayerController();
    player.yaw = 0.8;
    player.pitch = -0.4;

    new FirstPersonRig(camera).sync(player);

    expect(camera.rotation.order).toBe('YXZ');
    expect(camera.rotation.y).toBeCloseTo(0.8, 6);
    expect(camera.rotation.x).toBeCloseTo(-0.4, 6);
    expect(camera.rotation.z).toBeCloseTo(0, 6);
  });
});

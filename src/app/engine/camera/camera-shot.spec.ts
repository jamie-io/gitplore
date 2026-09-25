import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { ARRIVAL, MOMENT, arrivalShot, blendCamera, momentShot } from './camera-shot';

describe('arrivalShot', () => {
  const pose = { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } };

  it('holds the overview, then eases down to the rig by 3 s', () => {
    const shot = arrivalShot(pose, false);
    expect(shot.weight(0)).toBe(1);
    expect(shot.weight(1.2)).toBe(1);
    expect(shot.weight(2.1)).toBeCloseTo(0.5, 5);
    expect(shot.weight(3.0)).toBe(0);
    expect(shot.duration).toBe(3.0);
  });

  it('cuts under reduced motion', () => {
    const shot = arrivalShot(pose, true);
    expect(shot.weight(1.19)).toBe(1);
    expect(shot.weight(1.21)).toBe(0);
  });

  it('ends at the cut under reduced motion, with nothing left to ease', () => {
    expect(arrivalShot(pose, true).duration).toBe(ARRIVAL.hold);
  });

  it('is an arrival shot framing the pose it was given', () => {
    const shot = arrivalShot(pose, false);
    expect(shot.kind).toBe('arrival');
    expect(shot.pose).toBe(pose);
  });
});

describe('momentShot', () => {
  const pose = { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } };

  it('rises, holds and falls within 2.6 s', () => {
    const shot = momentShot(
      { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } },
      false,
    );
    expect(shot.weight(0)).toBe(0);
    expect(shot.weight(0.5)).toBe(1);
    expect(shot.weight(1.5)).toBe(1);
    expect(shot.weight(2.6)).toBe(0);
  });

  it('eases on both sides rather than moving at a constant rate', () => {
    const shot = momentShot(pose, false);
    expect(shot.weight(0.25)).toBeCloseTo(0.5, 5);
    expect(shot.weight(0.1)).toBeLessThan(0.2);
    expect(shot.weight(2.35)).toBeCloseTo(0.5, 5);
    expect(shot.duration).toBe(MOMENT.total);
    expect(shot.kind).toBe('moment');
  });

  it('cuts to the overview and back under reduced motion', () => {
    const shot = momentShot(pose, true);
    expect(shot.weight(0)).toBe(1);
    expect(shot.weight(2.59)).toBe(1);
    expect(shot.weight(2.6)).toBe(0);
    expect(shot.duration).toBe(MOMENT.total);
  });
});

describe('blendCamera', () => {
  it('leaves the rig pose alone at weight 0 and takes the shot pose at weight 1', () => {
    const camera = new PerspectiveCamera(60, 16 / 9);
    camera.position.set(1, 2, 3);
    camera.lookAt(1, 2, 0);
    const before = camera.quaternion.clone();
    blendCamera(camera, { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } }, 0);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.quaternion.equals(before)).toBe(true);
    blendCamera(
      camera,
      { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 }, fov: 50 },
      1,
    );
    expect(camera.position.toArray()).toEqual([0, 24, 36]);
    expect(camera.fov).toBe(50);
  });

  it('looks at the shot target at weight 1', () => {
    const camera = new PerspectiveCamera(60, 16 / 9);
    blendCamera(camera, { position: { x: 0, y: 24, z: 36 }, target: { x: 0, y: 0, z: -6 } }, 1);

    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const expected = new Vector3(0, -24, -42).normalize();
    expect(forward.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('goes part of the way at a partial weight', () => {
    const pose = { position: { x: 0, y: 20, z: 40 }, target: { x: 0, y: 0, z: 0 }, fov: 40 };
    const full = new PerspectiveCamera(60, 16 / 9);
    blendCamera(full, pose, 1);
    const camera = new PerspectiveCamera(60, 16 / 9);
    const start = new Quaternion();

    blendCamera(camera, pose, 0.5);

    expect(camera.position.toArray()).toEqual([0, 10, 20]);
    expect(camera.fov).toBe(50);
    expect(camera.quaternion.angleTo(start)).toBeCloseTo(full.quaternion.angleTo(start) / 2, 6);
  });

  it('keeps the projection in step with a changed field of view', () => {
    const camera = new PerspectiveCamera(60, 16 / 9);
    const reference = new PerspectiveCamera(50, 16 / 9);
    blendCamera(
      camera,
      { position: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 0, z: -1 }, fov: 50 },
      1,
    );

    expect(camera.projectionMatrix.equals(reference.projectionMatrix)).toBe(true);
  });

  it('leaves the field of view alone when the shot does not name one', () => {
    const camera = new PerspectiveCamera(60, 16 / 9);
    blendCamera(camera, { position: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 0, z: -1 } }, 1);

    expect(camera.fov).toBe(60);
  });
});

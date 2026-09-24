import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { createPlankSign } from './plank-sign';

function canvasContext(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('createPlankSign', () => {
  it('sizes its plank from label geometry and mounts label on a stake', () => {
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext());

    const sign = createPlankSign('Sprachen · Languages', '#6b4712', 0.8);

    expect(sign).toBeInstanceOf(Group);
    const label = sign?.getObjectByName('plank-sign-label') as Mesh;
    const plank = sign?.getObjectByName('plank-sign-plank') as Mesh;
    const post = sign?.getObjectByName('plank-sign-post') as Mesh;
    expect(label.scale.x).toBe(1);
    expect(label.scale.x).toBe(label.scale.y);
    expect((plank.geometry as BoxGeometry).parameters.width).toBeCloseTo(
      (label.geometry as BoxGeometry).parameters.width + 0.15,
      5,
    );
    expect((plank.geometry as BoxGeometry).parameters.height).toBeCloseTo(
      (label.geometry as BoxGeometry).parameters.height + 0.15,
      5,
    );
    expect((post.geometry as CylinderGeometry).parameters.height).toBe(0.8);

    disposeObject3D(sign as Group);
    context.mockRestore();
  });

  it('returns null when label canvas is unavailable', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(createPlankSign('No canvas', '#6b4712')).toBeNull();

    context.mockRestore();
  });
});

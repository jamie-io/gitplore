import { disposeObject3D, forEachResource } from '@engine/dispose';
import { stubContext } from '@engine/testing/world-context';
import { terrainHeightAt } from './terrain';
import { createSignpostLabel, LichtungSignpost, SIGNPOST_LABEL_ROTATION_Y } from './signpost';

function canvasContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('LichtungSignpost', () => {
  it('turns its label front toward the visitor approaching from -Z', () => {
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext());

    const label = createSignpostLabel();

    expect(label?.rotation.y).toBe(SIGNPOST_LABEL_ROTATION_Y);
    expect(label?.rotation.y).toBe(Math.PI);
    if (label) {
      disposeObject3D(label);
    }
    context.mockRestore();
  });

  it('disposes the label texture when a canvas is available', () => {
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext());
    const label = createSignpostLabel();
    expect(label).not.toBeNull();
    if (!label) {
      context.mockRestore();
      return;
    }

    const texture = (label.material as { map?: { dispose: () => void } }).map;
    expect(texture).toBeDefined();
    const dispose = texture && vi.spyOn(texture, 'dispose');

    disposeObject3D(label);

    expect(dispose?.mock.calls.length).toBe(1);
    context.mockRestore();
  });

  it('adds its sign and releases every owned resource', () => {
    const ctx = stubContext();
    const signpost = new LichtungSignpost({ heightAt: terrainHeightAt });
    signpost.init(ctx);

    const resources: { dispose: ReturnType<typeof vi.fn> }[] = [];
    const root = ctx.scene.getObjectByName('lichtung-404-signpost');
    expect(root).toBeDefined();
    if (!root) {
      signpost.dispose();
      return;
    }
    forEachResource(root, {
      geometry: (geometry) => resources.push({ dispose: vi.spyOn(geometry, 'dispose') }),
      material: (material) => {
        resources.push({ dispose: vi.spyOn(material, 'dispose') });
      },
    });

    expect(ctx.scene.getObjectByName('lichtung-404-signpost')).toBeDefined();
    signpost.dispose();

    expect(ctx.scene.children).toEqual([]);
    expect(resources.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });
});

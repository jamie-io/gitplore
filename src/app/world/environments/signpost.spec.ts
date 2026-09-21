import { forEachResource } from '@engine/dispose';
import { stubContext } from '@engine/testing/world-context';
import { terrainHeightAt } from './terrain';
import { LichtungSignpost } from './signpost';

describe('LichtungSignpost', () => {
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

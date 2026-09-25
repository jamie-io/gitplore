import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { DSCHUNGEL } from '../mood';
import { HazedCopies } from '../shaders/hazed-copies';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { EASEL_WIDEN, EXHIBIT_EASEL_MODEL, ExhibitEasel } from './exhibit-easel';

/** A stand-in for exhibit-easel.glb as the optimiser leaves it. */
function easelModel(): { model: Group; wood: MeshStandardMaterial; frame: Mesh } {
  const model = new Group();
  const wood = new MeshStandardMaterial({ name: 'easel-wood' });
  const frame = new Mesh(new BoxGeometry(1, 1, 1), wood);
  frame.name = 'exhibit-easel';
  frame.position.set(0.059, 1.672, -0.534);
  frame.scale.setScalar(2.219);
  const anchor = new Group();
  anchor.name = 'screen_anchor';
  anchor.position.set(0, 1.9, 0);
  model.add(frame, anchor);
  return { model, wood, frame };
}

function build(haze?: HazedCopies) {
  const assets = new StubAssets();
  const ctx = stubContext(assets);
  const easel = new ExhibitEasel({
    position: new Vector3(0, 0.4, -9),
    rotationY: 0,
    screenCentre: 1.9,
    haze,
  });
  easel.init(ctx);
  return { assets, ctx, easel };
}

describe('ExhibitEasel', () => {
  it('stands its screen anchor on the screen’s middle, widened to clear the screen', async () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const { assets, ctx, easel } = build(haze);
    expect(assets.requested).toEqual([EXHIBIT_EASEL_MODEL]);

    const { model, wood, frame } = easelModel();
    await assets.resolve(model);

    ctx.scene.updateMatrixWorld(true);
    const anchor = model.getObjectByName('screen_anchor')!.getWorldPosition(new Vector3());
    expect(anchor.x).toBeCloseTo(0, 6);
    expect(anchor.y).toBeCloseTo(0.4 + 1.9, 6);
    expect(anchor.z).toBeCloseTo(-9, 6);
    expect(frame.material).toBe(haze.of(wood));
    // The 3.4 m opening widened: 10 cm of air either side of the 3.4 m screen body.
    expect((3.4 * EASEL_WIDEN - 3.4) / 2).toBeGreaterThanOrEqual(0.1);

    easel.dispose();
    expect(assets.releasedModels).toEqual([EXHIBIT_EASEL_MODEL]);
    expect(ctx.scene.children).toEqual([]);
  });

  it('blocks its uprights and back legs, outside the screen’s body', () => {
    const { easel } = build();

    expect(easel.colliders).toHaveLength(4);
    for (const collider of easel.colliders) {
      expect(collider.kind).toBe('cylinder');
      if (collider.kind === 'cylinder') {
        expect(Math.abs(collider.x) - collider.radius).toBeGreaterThan(1.7);
      }
    }
  });

  it('keeps the exhibit on its own post when the model is missing, or arrives too late', async () => {
    const first = build();
    await first.assets.reject();
    expect(first.ctx.scene.getObjectByName('exhibit-easel')!.children).toEqual([]);

    const second = build();
    second.easel.dispose();
    const { model } = easelModel();
    await second.assets.resolve(model);
    expect(model.parent).toBeNull();
    expect(second.assets.releasedModels).toEqual([EXHIBIT_EASEL_MODEL]);
  });
});

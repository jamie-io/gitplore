import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { DSCHUNGEL } from '../mood';
import { HazedCopies } from '../shaders/hazed-copies';
import { SharedUniforms } from '../shaders/shared-uniforms';
import { LIANA_LEVER_MODEL, SEED_LEVER_PROMPT, SeedLever } from './seed-lever';

const ground = { heightAt: () => 0.25 };

function lever(onReseed: (offset: number) => void, reducedMotion = false): SeedLever {
  return new SeedLever({
    id: 'test:seed-lever',
    position: new Vector3(3, 0, -2),
    ground,
    onReseed,
    reducedMotion: () => reducedMotion,
  });
}

function jungleLever(
  onReseed: (offset: number) => void = () => undefined,
  assets = new StubAssets(),
  haze?: HazedCopies,
): { target: SeedLever; assets: StubAssets; ctx: ReturnType<typeof stubContext> } {
  const target = new SeedLever({
    id: 'test:jungle-model',
    position: new Vector3(3, 0, -2),
    ground,
    onReseed,
    skin: 'jungle',
    haze,
  });
  return { target, assets, ctx: stubContext(assets) };
}

function leverModel(options: { readonly stump?: boolean; readonly liana?: boolean } = {}): {
  readonly model: Group;
  readonly stumpMaterial?: MeshStandardMaterial;
  readonly lianaMaterial?: MeshStandardMaterial;
} {
  const model = new Group();
  let stumpMaterial: MeshStandardMaterial | undefined;
  let lianaMaterial: MeshStandardMaterial | undefined;
  if (options.stump !== false) {
    const stump = new Group();
    stump.name = 'liana-lever';
    stumpMaterial = new MeshStandardMaterial();
    stump.add(new Mesh(new BoxGeometry(0.4, 0.4, 0.4), stumpMaterial));
    model.add(stump);
  }
  if (options.liana !== false) {
    const liana = new Group();
    liana.name = 'liana-handle';
    liana.position.set(0.975, 2.55, 0);
    lianaMaterial = new MeshStandardMaterial();
    liana.add(new Mesh(new BoxGeometry(0.1, 1, 0.1), lianaMaterial));
    model.add(liana);
  }
  return { model, stumpMaterial, lianaMaterial };
}

describe('SeedLever', () => {
  it('renders jungle skin as a liana and keeps reseeding on pull', () => {
    const offsets: number[] = [];
    const target = new SeedLever({
      id: 'test:jungle-seed-lever',
      position: new Vector3(3, 0, -2),
      ground,
      onReseed: (offset) => offsets.push(offset),
      skin: 'jungle',
    });
    const ctx = stubContext();

    expect(target.interactables[0].prompt).toBe('Liane ziehen');
    expect(target.colliders).toEqual([{ kind: 'cylinder', x: 3, z: -2, radius: 0.42 }]);

    target.init(ctx);

    const handle = ctx.scene.getObjectByName('test:jungle-seed-lever:handle') as Group;
    const branch = ctx.scene.getObjectByName('test:jungle-seed-lever:branch') as Mesh;
    const trunk = ctx.scene.getObjectByName('test:jungle-seed-lever:trunk') as Mesh;
    expect(branch).toBeDefined();
    expect(trunk).toBeDefined();
    expect(ctx.scene.getObjectByName('test:jungle-seed-lever:liana')).toBeDefined();
    expect(handle.children.map((child) => child.name)).toEqual([
      'test:jungle-seed-lever:liana',
      'test:jungle-seed-lever:liana-grip',
    ]);
    expect(branch.rotation.z).toBeCloseTo(Math.PI / 2, 6);
    expect(branch.position.x).toBeGreaterThan(0);
    expect((trunk.material as MeshStandardMaterial).color.getHex()).toBe(0x3a3226);

    target.interactables[0].onInteract();
    target.update(0.1);

    expect(offsets).toEqual([1]);
    expect(handle.rotation.z).toBeLessThan(0);
    expect(branch.rotation.z).toBeCloseTo(Math.PI / 2, 6);
    target.dispose();
  });

  it('snaps jungle liana sway under reduced motion', () => {
    const target = new SeedLever({
      id: 'test:jungle-seed-lever',
      position: new Vector3(3, 0, -2),
      ground,
      onReseed: () => undefined,
      skin: 'jungle',
      reducedMotion: () => true,
    });
    const ctx = stubContext();
    target.init(ctx);
    const handle = ctx.scene.getObjectByName('test:jungle-seed-lever:handle') as Group;

    target.interactables[0].onInteract();
    target.update(0.1);

    expect(handle.rotation.z).toBe(0);
    target.dispose();
  });

  it('replaces jungle lever parts with authored nodes, keeps pivot offset, and hazes materials', async () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const assets = new StubAssets();
    const { target, ctx } = jungleLever(() => undefined, assets, haze);
    const { model, stumpMaterial, lianaMaterial } = leverModel();
    target.init(ctx);

    expect(assets.requested).toEqual([LIANA_LEVER_MODEL]);
    await assets.resolve(model);

    const root = ctx.scene.getObjectByName('test:jungle-model')!;
    const handle = ctx.scene.getObjectByName('test:jungle-model:handle') as Group;
    const stump = root.getObjectByName('liana-lever')!;
    const liana = handle.getObjectByName('liana-handle')!;
    expect(root.getObjectByName('test:jungle-model:base')).toBeUndefined();
    expect(root.getObjectByName('test:jungle-model:trunk')).toBeUndefined();
    expect(root.getObjectByName('test:jungle-model:branch')).toBeUndefined();
    expect(root.getObjectByName('test:jungle-model:liana')).toBeUndefined();
    expect(root.getObjectByName('test:jungle-model:liana-grip')).toBeUndefined();
    expect(stump.parent).toBe(root);
    expect(liana.parent).toBe(handle);
    expect(liana.position.x).toBeCloseTo(0.1, 6);
    expect(liana.position.y).toBeCloseTo(0.2, 6);
    expect(liana.position.z).toBeCloseTo(0, 6);
    expect((stump.children[0] as Mesh).material).toBe(haze.of(stumpMaterial!));
    expect((liana.children[0] as Mesh).material).toBe(haze.of(lianaMaterial!));

    target.interactables[0].onInteract();
    target.update(0.1);
    expect(handle.rotation.z).toBeLessThan(0);

    target.dispose();
    expect(assets.releasedModels).toEqual([LIANA_LEVER_MODEL]);
  });

  it('releases an incomplete jungle model and keeps procedural parts', async () => {
    for (const missing of ['stump', 'liana'] as const) {
      const assets = new StubAssets();
      const { target, ctx } = jungleLever(() => undefined, assets);
      target.init(ctx);
      await assets.resolve(leverModel({ [missing === 'stump' ? 'stump' : 'liana']: false }).model);

      expect(ctx.scene.getObjectByName('test:jungle-model:base')).toBeDefined();
      expect(ctx.scene.getObjectByName('test:jungle-model:trunk')).toBeDefined();
      expect(ctx.scene.getObjectByName('test:jungle-model:branch')).toBeDefined();
      expect(ctx.scene.getObjectByName('test:jungle-model:liana')).toBeDefined();
      expect(ctx.scene.getObjectByName('test:jungle-model:liana-grip')).toBeDefined();
      expect(assets.releasedModels).toEqual([LIANA_LEVER_MODEL]);
      target.dispose();
    }
  });

  it('releases a late jungle lever model after disposal', async () => {
    const assets = new StubAssets();
    const { target, ctx } = jungleLever(() => undefined, assets);
    target.init(ctx);
    target.dispose();

    await assets.resolve(leverModel().model);

    expect(assets.releasedModels).toEqual([LIANA_LEVER_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('does not request a model for the default skin', () => {
    const assets = new StubAssets();
    const target = lever(() => undefined);
    target.init(stubContext(assets));

    expect(assets.requested).toEqual([]);
    target.dispose();
  });

  it('asks for offset n on the n-th pull', () => {
    const offsets: number[] = [];
    const target = lever((offset) => offsets.push(offset));

    for (let pull = 0; pull < 5; pull++) {
      target.interactables[0].onInteract();
    }

    expect(offsets).toEqual([1, 2, 3, 4, 5]);
    expect(target.pulls).toBe(5);
  });

  it('starts from offset 0 again when the world builds a new one', () => {
    const offsets: number[] = [];
    lever((offset) => offsets.push(offset)).interactables[0].onInteract();
    lever((offset) => offsets.push(offset)).interactables[0].onInteract();

    expect(offsets).toEqual([1, 1]);
  });

  it('stands on the ground with one fixed collider and a German prompt', () => {
    const target = lever(() => undefined);
    const colliders = target.colliders;

    target.interactables[0].onInteract();

    expect(target.position.y).toBe(0.25);
    expect(target.colliders).toBe(colliders);
    expect(colliders).toEqual([{ kind: 'cylinder', x: 3, z: -2, radius: 0.42 }]);
    expect(target.interactables[0].prompt).toBe(SEED_LEVER_PROMPT);
    expect(SEED_LEVER_PROMPT).toBe('Dekoration neu würfeln');
  });

  it('throws the handle and lets it spring back, unless motion is reduced', () => {
    const ctx = stubContext();
    const moving = lever(() => undefined);
    moving.init(ctx);
    const handle = ctx.scene.getObjectByName('test:seed-lever:handle') as Group;

    moving.interactables[0].onInteract();
    moving.update(0.1);
    expect(handle.rotation.z).toBeLessThan(0);
    for (let frame = 0; frame < 120; frame++) {
      moving.update(1 / 60);
    }
    expect(handle.rotation.z).toBe(0);
    moving.dispose();

    const still = lever(() => undefined, true);
    still.init(ctx);
    const stillHandle = ctx.scene.getObjectByName('test:seed-lever:handle') as Group;
    still.interactables[0].onInteract();
    still.update(0.1);
    expect(stillHandle.rotation.z).toBe(0);
    still.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });
});

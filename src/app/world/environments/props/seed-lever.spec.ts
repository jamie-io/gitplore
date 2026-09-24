import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { SEED_LEVER_PROMPT, SeedLever } from './seed-lever';

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

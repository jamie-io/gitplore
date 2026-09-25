import { BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import { STEP_HEIGHT, floorHeightAt } from '@engine/player/collision';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import {
  ARCH,
  BOARDWALK,
  DECK,
  STATION_STANDS,
  STEPS,
  jungleHeightAt,
  stepCentres,
} from './jungle-layout';
import {
  COMMIT_STEPS_MODEL,
  JungleSteps,
  STEP_INLAY_MATERIAL,
  beam,
  stepNode,
} from './jungle-steps';
import { SharedUniforms } from './shaders/shared-uniforms';
import { DSCHUNGEL } from './mood';

const ground = { heightAt: jungleHeightAt };
const steps = () => new JungleSteps({ shared: new SharedUniforms(DSCHUNGEL) });

/** A model with one mesh per step, each wearing a wood material and the shared inlay. */
function stepsModel(): { model: Group; inlay: MeshStandardMaterial } {
  const model = new Group();
  const inlay = new MeshStandardMaterial({ name: STEP_INLAY_MATERIAL });
  const wood = new MeshStandardMaterial({ name: 'wood' });
  for (let i = 0; i < STEPS.count; i++) {
    const step = new Group();
    step.name = stepNode(i);
    step.add(new Mesh(new BoxGeometry(1, 0.1, 0.4), wood));
    step.add(new Mesh(new BoxGeometry(0.8, 0.01, 0.05), inlay));
    model.add(step);
  }
  return { model, inlay };
}

describe('JungleSteps', () => {
  it('lays a beam from one end to the other, rising with them', () => {
    const geometry = beam({ x: 0, y: 0, z: 0 }, { x: 3, y: 2, z: -4 }, [0.1, 0.1], 0x000000);
    const position = geometry.getAttribute('position');
    // The vertex furthest along the beam's direction sits at its high end, not mirrored below.
    let far = 0;
    for (let i = 1; i < position.count; i++) {
      const along = (index: number) => position.getX(index) * 3 - position.getZ(index) * 4;
      if (along(i) > along(far)) {
        far = i;
      }
    }
    expect(position.getY(far)).toBeGreaterThan(1.8);
    expect(position.getX(far)).toBeCloseTo(3, 0);
  });

  it('names the model’s step nodes step_00 … step_10', () => {
    expect(stepNode(0)).toBe('step_00');
    expect(stepNode(10)).toBe('step_10');
  });

  it('stands the visitor on each step’s tread, rising 0.8 → 2.4 m', () => {
    const { colliders } = steps();
    expect(colliders.every((collider) => collider.top !== undefined)).toBe(true);

    let feet: number = STEPS.bottom;
    for (const centre of stepCentres()) {
      const floor = floorHeightAt(centre.x, centre.z, feet, ground, colliders);
      expect(floor).toBeCloseTo(centre.y, 6);
      expect(floor - feet).toBeLessThan(STEP_HEIGHT);
      feet = floor;
    }
    expect(feet).toBeCloseTo(STEPS.top, 6);
  });

  it('is a wall from the marsh beside the flight', () => {
    const { colliders } = steps();
    const middle = stepCentres()[5];
    // A visitor on the marsh under the middle of the flight cannot step up onto it.
    expect(
      floorHeightAt(middle.x, middle.z, jungleHeightAt(middle.x, middle.z), ground, colliders),
    ).toBeCloseTo(jungleHeightAt(middle.x, middle.z), 6);
  });

  it('lands the top step on the deck’s level', () => {
    const { colliders } = steps();
    for (const z of [STEPS.to.z, ARCH.z + DECK.halfLength + 0.2, 2.6]) {
      expect(floorHeightAt(0, z, DECK.height, ground, colliders), `at z ${z}`).toBeCloseTo(
        DECK.height,
        6,
      );
    }
  });

  it('carries the boardwalk over the marsh at 0.8 m, from the ramp to the steps', () => {
    const { colliders } = steps();
    const stand = STATION_STANDS.pfad;
    expect(jungleHeightAt(stand.x, stand.z)).toBeLessThan(STEPS.bottom);
    expect(floorHeightAt(stand.x, stand.z, STEPS.bottom, ground, colliders)).toBeCloseTo(
      STEPS.bottom,
      6,
    );
    for (const point of BOARDWALK.slice(2)) {
      expect(
        floorHeightAt(point.x, point.z, STEPS.bottom, ground, colliders),
      ).toBeGreaterThanOrEqual(STEPS.bottom - 1e-9);
    }
  });

  it('builds the boardwalk, the flight and its inlays, and asks for the model', () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = steps();
    target.init(ctx);

    expect(ctx.scene.getObjectByName('boardwalk')).toBeInstanceOf(Mesh);
    expect(ctx.scene.getObjectByName('commit-steps')).toBeInstanceOf(Mesh);
    const inlay = ctx.scene.getObjectByName('commit-steps-inlay') as InstancedMesh;
    expect(inlay.count).toBe(STEPS.count);
    expect(assets.requested).toEqual([COMMIT_STEPS_MODEL]);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('lights a step’s inlay when its period had commits, and darkens it again', () => {
    const ctx = stubContext();
    const target = steps();
    target.init(ctx);
    const inlay = ctx.scene.getObjectByName('commit-steps-inlay') as InstancedMesh;
    const brightness = (index: number) => {
      const colour = new Color();
      inlay.getColorAt(index, colour);
      return colour.r + colour.g + colour.b;
    };
    const dark = brightness(3);

    target.setLit(3, true);
    expect(target.isLit(3)).toBe(true);
    expect(target.isLit(4)).toBe(false);
    expect(brightness(3)).toBeGreaterThan(dark * 4);
    expect(brightness(4)).toBeCloseTo(dark, 6);

    target.setLit(3, false);
    expect(target.isLit(3)).toBe(false);
    expect(brightness(3)).toBeCloseTo(dark, 6);
    // Out of range: nothing to light.
    target.setLit(11, true);
    target.setLit(-1, true);
    target.dispose();
  });

  it('swaps in the authored steps, each with its own inlay, and hands the model back', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = steps();
    target.init(ctx);
    target.setLit(0, true);
    const { model, inlay } = stepsModel();

    await assets.resolve(model);

    expect(ctx.scene.getObjectByName('commit-steps-model')).toBe(model);
    expect(ctx.scene.getObjectByName('commit-steps')).toBeUndefined();
    expect(ctx.scene.getObjectByName('commit-steps-inlay')).toBeUndefined();
    expect(ctx.scene.getObjectByName('boardwalk')).toBeDefined();
    expect(model.position.toArray()).toEqual([STEPS.from.x, STEPS.bottom, STEPS.from.z]);
    // The model's −Z runs up the flight.
    const up = { x: -Math.sin(model.rotation.y), z: -Math.cos(model.rotation.y) };
    const flight = Math.hypot(STEPS.to.x - STEPS.from.x, STEPS.to.z - STEPS.from.z);
    expect(up.x).toBeCloseTo((STEPS.to.x - STEPS.from.x) / flight, 6);
    expect(up.z).toBeCloseTo((STEPS.to.z - STEPS.from.z) / flight, 6);

    const inlayOf = (index: number) =>
      (model.getObjectByName(stepNode(index))!.children[1] as Mesh)
        .material as MeshStandardMaterial;
    expect(inlayOf(0)).not.toBe(inlayOf(1));
    expect(inlayOf(0)).not.toBe(inlay);
    expect(inlayOf(0).customProgramCacheKey()).toContain('atmosphere');
    expect(inlayOf(0).emissiveIntensity).toBeGreaterThan(inlayOf(1).emissiveIntensity);
    target.setLit(1, true);
    expect(inlayOf(1).emissiveIntensity).toBe(inlayOf(0).emissiveIntensity);
    // The wood is one hazed copy, shared by every step.
    const woodOf = (index: number) =>
      (model.getObjectByName(stepNode(index))!.children[0] as Mesh).material;
    expect(woodOf(0)).toBe(woodOf(5));

    target.dispose();
    expect(assets.releasedModels).toEqual([COMMIT_STEPS_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
  });

  it('keeps the procedural flight when the model is missing, and hands back a late one', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const target = steps();
    target.init(ctx);
    await assets.reject();
    expect(ctx.scene.getObjectByName('commit-steps')).toBeDefined();
    target.dispose();

    const late = steps();
    late.init(ctx);
    late.dispose();
    await assets.resolve(stepsModel().model);
    expect(assets.releasedModels).toEqual([COMMIT_STEPS_MODEL]);
  });
});

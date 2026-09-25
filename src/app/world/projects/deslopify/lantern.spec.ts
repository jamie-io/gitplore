import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  TorusGeometry,
  Vector3,
} from 'three';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import { DSCHUNGEL } from '../../environments/mood';
import { HazedCopies } from '../../environments/shaders/hazed-copies';
import { SharedUniforms } from '../../environments/shaders/shared-uniforms';
import { LANTERN_GLASS_MATERIAL, LANTERN_MODEL, Lantern } from './lantern';

const POSITION = new Vector3(2.3, 0, 4.2);

function built(reducedMotion = false) {
  const ctx = stubContext();
  const lantern = new Lantern({
    position: POSITION,
    rotationY: 0.35,
    reducedMotion: () => reducedMotion,
  });
  lantern.init(ctx);
  return { ctx, lantern };
}

function root(ctx: ReturnType<typeof stubContext>): Object3D {
  const found = ctx.scene.getObjectByName('deslopify:lantern');
  if (!found) {
    throw new Error('lantern was not added to scene');
  }
  return found;
}

function part(ctx: ReturnType<typeof stubContext>, name: string): Mesh {
  const found = ctx.scene.getObjectByName(name);
  if (!(found instanceof Mesh)) {
    throw new Error(`no mesh called ${name}`);
  }
  return found;
}

function geometry<T extends BufferGeometry>(ctx: ReturnType<typeof stubContext>, name: string): T {
  return part(ctx, name).geometry as T;
}

describe('Lantern', () => {
  it('builds the Lookdev post, arm, body, bars, roof, ring, and light', () => {
    const { ctx, lantern } = built();

    expect(lantern.colliders).toEqual([
      { kind: 'cylinder', x: POSITION.x, z: POSITION.z, radius: 0.14 },
    ]);

    const post = geometry<CylinderGeometry>(ctx, 'lantern-post');
    expect(post.parameters).toMatchObject({ radiusTop: 0.07, radiusBottom: 0.09, height: 2.1 });

    const arm = geometry<BoxGeometry>(ctx, 'lantern-arm');
    expect(arm.parameters).toMatchObject({ width: 0.5, height: 0.05, depth: 0.05 });

    const base = geometry<CylinderGeometry>(ctx, 'lantern-base');
    expect(base.parameters).toMatchObject({ radiusTop: 0.12, radiusBottom: 0.14, height: 0.05 });
    expect(geometry<CylinderGeometry>(ctx, 'lantern-glass').parameters).toMatchObject({
      radiusTop: 0.1,
      radiusBottom: 0.1,
      height: 0.24,
    });
    expect(root(ctx).getObjectsByProperty('name', 'lantern-bar').length).toBe(4);
    expect(geometry<ConeGeometry>(ctx, 'lantern-roof').parameters).toMatchObject({
      radius: 0.15,
      height: 0.14,
    });
    expect(geometry<TorusGeometry>(ctx, 'lantern-ring').parameters).toMatchObject({
      radius: 0.05,
      tube: 0.012,
    });

    const metal = part(ctx, 'lantern-arm').material as MeshStandardMaterial;
    expect(metal.color.getHex()).toBe(0x2c2a22);
    expect(metal.roughness).toBeCloseTo(0.4, 6);
    expect(metal.metalness).toBeCloseTo(0.7, 6);

    const glass = part(ctx, 'lantern-glass').material as MeshStandardMaterial;
    expect(glass.emissive.getHex()).toBe(0xffa640);
    expect(glass.emissiveIntensity).toBe(0);

    const light = root(ctx).getObjectByName('lantern-light');
    expect(light).toBeInstanceOf(PointLight);
    expect((light as PointLight).color.getHex()).toBe(0xffb45a);
    expect((light as PointLight).distance).toBe(11);
    expect((light as PointLight).decay).toBeCloseTo(1.6, 6);
    expect((light as PointLight).intensity).toBe(0);

    const expectedPosition = new Vector3(-0.42, 1.5, 0)
      .applyAxisAngle(new Vector3(0, 1, 0), 0.35)
      .add(POSITION);
    expect(lantern.worldPosition(new Vector3())).toEqual(expectedPosition);
  });

  it('replaces procedural parts with the lantern model and keeps its lit glass and light', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const lantern = new Lantern({
      position: POSITION,
      rotationY: 0.35,
      haze,
    });
    lantern.init(ctx);

    const proceduralPost = part(ctx, 'lantern-post');
    const proceduralGlass = part(ctx, 'lantern-glass');
    const litMaterial = proceduralGlass.material;
    const model = new Group();
    const post = new Group();
    post.name = 'lantern-post';
    const postMaterial = new MeshStandardMaterial({ name: 'lantern-wood' });
    const postMesh = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), postMaterial);
    post.add(postMesh);
    const body = new Group();
    body.name = 'lantern-body';
    // Authored where the body hangs, (-0.42, 1.5, 0), plus an optimiser's dequantising offset.
    body.position.set(-0.42 + 0.1, 1.5 + 0.2, 0.05);
    const glassMaterial = new MeshStandardMaterial({ name: LANTERN_GLASS_MATERIAL });
    const glass = new Mesh(new CylinderGeometry(0.1, 0.1, 0.2), glassMaterial);
    glass.name = 'lantern-glass';
    const woodMaterial = new MeshStandardMaterial({ name: 'lantern-wood' });
    const wood = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), woodMaterial);
    body.add(glass, wood);
    model.add(post, body);

    expect(assets.requested).toEqual([LANTERN_MODEL]);
    await assets.resolve(model);

    const lanternRoot = root(ctx);
    const movingBody = lanternRoot.children.find(
      (child): child is Group => child instanceof Group && child.name === 'lantern-body',
    );
    expect(proceduralPost.parent).toBeNull();
    expect(proceduralGlass.parent).toBeNull();
    expect(lanternRoot.getObjectByName('lantern-arm')).toBeUndefined();
    expect(lanternRoot.getObjectByName('lantern-base')).toBeUndefined();
    expect(post.parent).toBe(lanternRoot);
    expect(body.parent).toBe(movingBody);
    // Only the authored placement comes off; the dequantising offset stays.
    expect(body.position.x).toBeCloseTo(0.1, 6);
    expect(body.position.y).toBeCloseTo(0.2, 6);
    expect(body.position.z).toBeCloseTo(0.05, 6);
    expect(glass.material).toBe(litMaterial);
    expect(wood.material).toBe(haze.of(woodMaterial));
    expect(lanternRoot.getObjectByName('lantern-light')).toBeInstanceOf(PointLight);

    lantern.ignite();
    lantern.update(0.35);
    expect((glass.material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(1.6, 6);
    lantern.update(0.35);
    expect((glass.material as MeshStandardMaterial).emissiveIntensity).toBe(3.2);

    lantern.dispose();
    lantern.dispose();
    expect(assets.releasedModels).toEqual([LANTERN_MODEL]);
  });

  it('releases a lantern model missing either required node and keeps the procedural lantern', async () => {
    for (const present of ['lantern-post', 'lantern-body']) {
      const assets = new StubAssets();
      const ctx = stubContext(assets);
      const lantern = new Lantern({ position: POSITION, rotationY: 0.35 });
      lantern.init(ctx);
      const model = new Group();
      const node = new Group();
      node.name = present;
      model.add(node);

      await assets.resolve(model);

      expect(assets.releasedModels).toEqual([LANTERN_MODEL]);
      expect(part(ctx, 'lantern-post')).toBeInstanceOf(Mesh);
      expect(part(ctx, 'lantern-arm')).toBeInstanceOf(Mesh);
      lantern.dispose();
    }
  });

  it('releases a lantern model that arrives after dispose without adding it', async () => {
    const assets = new StubAssets();
    const ctx = stubContext(assets);
    const lantern = new Lantern({ position: POSITION, rotationY: 0.35 });
    lantern.init(ctx);
    lantern.dispose();

    const model = new Group();
    await assets.resolve(model);

    expect(assets.releasedModels).toEqual([LANTERN_MODEL]);
    expect(model.parent).toBeNull();
    expect(ctx.scene.children).toEqual([]);
  });

  it('eases ignition glow from zero to one over 0.7 seconds on the post', () => {
    const { lantern } = built();

    expect(lantern.glow).toBe(0);
    expect(lantern.lightRadius).toBe(0);

    lantern.ignite();
    lantern.update(0.35);
    expect(lantern.glow).toBeCloseTo(0.5, 6);
    expect(lantern.lightRadius).toBeCloseTo(1.25, 6);

    lantern.update(0.35);
    expect(lantern.glow).toBe(1);
  });

  it('carries the lantern after 0.9 seconds when a hand socket is supplied', () => {
    const { ctx, lantern } = built();
    const hand = new Object3D();
    hand.position.set(4, 1, -2);
    ctx.scene.add(hand);
    lantern.attachTo(hand);
    lantern.ignite();

    lantern.update(0.89);
    expect(ctx.scene.getObjectByName('lantern-body')?.parent).not.toBe(hand);

    lantern.update(0.01);
    const body = ctx.scene.getObjectByName('lantern-body');
    expect(body?.parent).toBe(hand);
    expect(lantern.lightRadius).toBe(5.5);
    expect(lantern.worldPosition(new Vector3())).toEqual(expect.any(Vector3));
  });

  it('keeps its point light on a visible hand socket while the avatar is hidden', () => {
    const { ctx, lantern } = built();
    const hand = new Object3D();
    const visibleHand = new Object3D();
    ctx.scene.add(hand, visibleHand);
    lantern.attachTo(hand, visibleHand);
    lantern.ignite();
    lantern.update(0.9);

    const light = ctx.scene.getObjectByName('lantern-light');
    expect(light?.parent).toBe(visibleHand);
    expect(light).toBeInstanceOf(PointLight);
    expect((light as PointLight).intensity).toBeGreaterThan(0);
  });

  it('toggles carried light off over 0.4 seconds and back on', () => {
    const { ctx, lantern } = built();
    const hand = new Object3D();
    ctx.scene.add(hand);
    lantern.attachTo(hand);
    lantern.ignite();
    lantern.update(0.9);

    lantern.toggle();
    lantern.update(0.2);
    expect(lantern.glow).toBeCloseTo(0.5, 6);
    expect(lantern.lightRadius).toBeCloseTo(2.75, 6);
    lantern.update(0.2);
    expect(lantern.glow).toBe(0);
    expect(lantern.lightRadius).toBe(0);

    lantern.toggle();
    lantern.update(0.7);
    expect(lantern.glow).toBe(1);
    expect(lantern.lightRadius).toBe(5.5);
  });

  it('makes ignition, carry, and toggle transitions instant with reduced motion', () => {
    const { ctx, lantern } = built(true);
    const hand = new Object3D();
    ctx.scene.add(hand);
    lantern.attachTo(hand);

    lantern.ignite();
    lantern.update(0.001);
    expect(lantern.glow).toBe(1);
    expect(ctx.scene.getObjectByName('lantern-body')?.parent).toBe(hand);

    lantern.toggle();
    lantern.update(0.001);
    expect(lantern.glow).toBe(0);
    lantern.toggle();
    lantern.update(0.001);
    expect(lantern.glow).toBe(1);
  });

  it('disposes all lantern resources and removes its scene object', () => {
    const { ctx, lantern } = built();
    const resources = new Set<BufferGeometry | Material>();
    const sceneObject = root(ctx);
    sceneObject.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.addEventListener('dispose', () => resources.add(object.geometry));
        const material = object.material as Material;
        material.addEventListener('dispose', () => resources.add(material));
      }
    });

    lantern.dispose();

    // Ten geometries plus the post, metal, and glass materials.
    expect(resources.size).toBe(13);
    expect(ctx.scene.children).toEqual([]);
    expect(sceneObject.children).toEqual([]);
  });
});

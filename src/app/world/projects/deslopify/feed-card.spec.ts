import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { StubAssets } from '@engine/testing/world-context';
import { DSCHUNGEL } from '../../environments/mood';
import { HazedCopies } from '../../environments/shaders/hazed-copies';
import { SharedUniforms } from '../../environments/shaders/shared-uniforms';
import { BADGE, FEED_CARDS } from './deslopify.data';
import { CARD_FRAME_MODEL, FEED_WALL_MODEL, FeedCard, FeedWall } from './feed-card';

interface CanvasFixture {
  readonly contexts: CanvasRenderingContext2D[];
  readonly fillText: ReturnType<typeof vi.fn>;
  readonly fonts: string[];
  readonly written: string[][];
  restore(): void;
}

function canvasFixture(): CanvasFixture {
  const contexts: CanvasRenderingContext2D[] = [];
  const fonts: string[] = [];
  const written: string[][] = [];
  const fillText = vi.fn();
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const stateWritten: string[] = [];
    const context = {
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      lineWidth: 1,
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      rect: vi.fn(),
      setTransform: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: (...args: Parameters<CanvasRenderingContext2D['fillText']>) => {
        stateWritten.push(String(args[0]));
        fillText(...args);
      },
      measureText: (text: string) => ({ width: text.length * 12 }),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(context, 'font', {
      get: () => fonts.at(-1) ?? '',
      set: (value: string) => fonts.push(value),
    });
    contexts.push(context);
    written.push(stateWritten);
    return context;
  });
  return { contexts, fillText, fonts, written, restore: () => spy.mockRestore() };
}

function faceOf(card: FeedCard): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const face = card.object.getObjectByName('feed-card-face');
  expect(face).toBeInstanceOf(Mesh);
  return face as Mesh<PlaneGeometry, MeshBasicMaterial>;
}

function mapsOf(card: FeedCard): { original: CanvasTexture; slop: CanvasTexture } {
  const material = faceOf(card).material;
  return {
    original: material.userData['originalMap'] as CanvasTexture,
    slop: material.userData['slopMap'] as CanvasTexture,
  };
}

describe('FeedCard', () => {
  it('builds the standing frame, face and posts at the design dimensions', () => {
    const card = new FeedCard(FEED_CARDS[0]);
    const frame = card.object.getObjectByName('feed-card-frame') as Mesh;
    const face = faceOf(card);
    const posts = card.object.children.filter((child) => child.name.startsWith('feed-card-post'));

    expect(frame.geometry.type).toBe('RoundedBoxGeometry');
    expect((frame.geometry as RoundedBoxGeometry).parameters).toMatchObject({
      width: 2.1,
      height: 1.98,
      depth: 0.14,
      segments: 3,
      radius: 0.05,
    });
    expect(face.geometry.parameters).toMatchObject({ width: 1.92, height: 1.8 });
    expect(face.position.toArray()).toEqual([0, 2.05, 0.075]);
    expect(posts).toHaveLength(2);
    expect(posts.map((post) => post.position.x)).toEqual([-0.85, 0.85]);
    posts.forEach((post) => {
      expect(post).toBeInstanceOf(Mesh);
      expect((post as Mesh).geometry).toBeInstanceOf(CylinderGeometry);
      expect(((post as Mesh).geometry as CylinderGeometry).parameters).toMatchObject({
        radiusTop: 0.07,
        radiusBottom: 0.09,
        height: 1.3,
      });
    });

    card.dispose();
  });

  it('loads the stand once, removes procedural frame parts, and hazes its materials', async () => {
    const assets = new StubAssets();
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const card = new FeedCard(FEED_CARDS[0]);
    card.loadFrame(assets, false, haze);
    card.loadFrame(assets, false, haze);

    const originalMaterial = new MeshStandardMaterial({ name: 'card-frame-wood' });
    const modelMesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), originalMaterial);
    const model = new Group();
    model.add(modelMesh);
    expect(assets.requested).toEqual([CARD_FRAME_MODEL]);
    await assets.resolve(model);

    expect(card.object.getObjectByName('feed-card-frame')).toBeUndefined();
    expect(card.object.getObjectByName('feed-card-post-0')).toBeUndefined();
    expect(card.object.getObjectByName('feed-card-post-1')).toBeUndefined();
    expect(card.object.getObjectByName('feed-card-stand')).toBe(model);
    expect(card.object.getObjectByName('feed-card-face')).toBeDefined();
    expect(modelMesh.material).toBe(haze.of(originalMaterial));

    card.dispose();
    card.dispose();
    expect(assets.releasedModels).toEqual([CARD_FRAME_MODEL]);
  });

  it('releases a stand model that arrives after dispose without adding it', async () => {
    const assets = new StubAssets();
    const card = new FeedCard(FEED_CARDS[0]);
    card.loadFrame(assets);
    card.dispose();

    const model = new Group();
    await assets.resolve(model);

    expect(assets.releasedModels).toEqual([CARD_FRAME_MODEL]);
    expect(model.parent).toBeNull();
    expect(card.object.children).toEqual([]);
  });

  it('draws both 640 by 600 card states with canonical copy and typography', () => {
    const canvas = canvasFixture();
    const card = new FeedCard(FEED_CARDS[0]);
    const maps = mapsOf(card);
    const [slopWritten, originalWritten] = canvas.written;
    const data = FEED_CARDS[0];

    expect(maps.original.image.width).toBe(640);
    expect(maps.original.image.height).toBe(600);
    expect(maps.slop.image.width).toBe(640);
    expect(maps.slop.image.height).toBe(600);
    expect(maps.original.anisotropy).toBe(8);
    expect(maps.slop.anisotropy).toBe(8);
    expect(slopWritten).toContain(data.slop);
    expect(originalWritten).toContain(data.original);
    expect(slopWritten).toContain(data.meta);
    expect(originalWritten).toContain(data.meta);
    expect(slopWritten).toContain(BADGE.translated);
    expect(originalWritten).toContain(BADGE.original);
    expect(slopWritten).toContain(data.duration);
    expect(originalWritten).toContain(data.duration);
    expect(slopWritten).toContain(data.avatar);
    expect(originalWritten).toContain(data.avatar);
    expect(slopWritten).toContain(data.slopThumb);
    expect(originalWritten).not.toContain(data.slopThumb);
    expect(slopWritten).toContain('KI-übersetzt');
    expect(originalWritten).not.toContain('KI-übersetzt');
    expect(slopWritten).not.toContain('ÜBERSETZT · translated');
    expect(originalWritten).not.toContain('ORIGINAL');
    expect(canvas.fonts).toContain('800 140px "Barlow", system-ui, sans-serif');
    expect(canvas.fonts).toContain('500 30px "IBM Plex Mono", ui-monospace, monospace');
    expect(canvas.fonts).toContain('700 38px "Barlow", system-ui, sans-serif');
    expect(canvas.fonts).toContain('500 26px "Barlow", system-ui, sans-serif');
    expect(canvas.fonts).toContain('700 22px system-ui, sans-serif');

    card.dispose();
    canvas.restore();
  });

  it('mixes original on the left and translated content on the right with a glowing seam', () => {
    const canvas = canvasFixture();
    const card = new FeedCard(FEED_CARDS[0]);
    const material = faceOf(card).material;
    const shader = {
      uniforms: {},
      fragmentShader:
        '#include <map_fragment>\n#include <fog_fragment>\n#include <tonemapping_fragment>',
    } as Parameters<MeshBasicMaterial['onBeforeCompile']>[0];

    material.onBeforeCompile(shader, {} as WebGLRenderer);

    expect(shader.uniforms['uWipe'].value).toBe(0);
    expect(shader.uniforms['uOriginalMap'].value).toBe(mapsOf(card).original);
    expect(shader.uniforms['uSlopMap'].value).toBe(mapsOf(card).slop);
    expect(shader.fragmentShader).toContain('uWipe * 1.08 - .04');
    expect(shader.fragmentShader).toContain('step(vMapUv.x, e)');
    expect(shader.fragmentShader).toContain('exp(-abs(vMapUv.x - e) * 70.0)');
    expect(shader.fragmentShader).toContain('smoothstep(0.0, 0.04, uWipe)');
    expect(shader.fragmentShader).toContain('(1.0 - smoothstep(0.96, 1.0, uWipe))');
    expect(shader.fragmentShader).toContain('vec3(1.0, 0.6, 0.22) * 4.0');
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');

    card.dispose();
    canvas.restore();
  });

  it('shows the wipe the flow gives it, clamped, and the original from half way', () => {
    const card = new FeedCard(FEED_CARDS[0]);
    expect(card.wipe).toBe(0);

    card.setWipe(0.4);
    expect(card.wipe).toBe(0.4);
    expect(card.original).toBe(false);
    card.setWipe(0.6);
    expect(card.original).toBe(true);
    card.setWipe(3);
    expect(card.wipe).toBe(1);
    card.setWipe(-1);
    expect(card.wipe).toBe(0);

    card.dispose();
  });

  it('disposes both canvas textures and every card resource', () => {
    const canvas = canvasFixture();
    const card = new FeedCard(FEED_CARDS[0]);
    const maps = mapsOf(card);
    const originalDispose = vi.spyOn(maps.original, 'dispose');
    const slopDispose = vi.spyOn(maps.slop, 'dispose');

    card.dispose();

    expect(originalDispose).toHaveBeenCalledOnce();
    expect(slopDispose).toHaveBeenCalledOnce();
    expect(card.object.children).toHaveLength(0);
    canvas.restore();
  });
});

describe('FeedWall', () => {
  /** A stand-in for feed-wall.glb, laid out as the optimiser leaves it. */
  function wallModel(): {
    model: Group;
    stone: MeshStandardMaterial;
    wall: Mesh;
    lever: Mesh;
  } {
    const model = new Group();
    const stone = new MeshStandardMaterial({ name: 'wall-stone' });
    const wall = new Mesh(new BoxGeometry(1, 1, 1), stone);
    wall.name = 'feed-wall';
    // The optimiser's dequantising offset and scale sit on every mesh node.
    wall.position.set(0.3, 1.341, 0.16);
    wall.scale.setScalar(3.171);
    const lever = new Mesh(new BoxGeometry(1, 1, 1), stone);
    lever.name = 'lever';
    lever.position.set(3.18, 1.569, 0.02);
    lever.scale.setScalar(0.501);
    const hinge = new Group();
    hinge.name = 'lever_hinge';
    hinge.position.set(3.18, 1.12, 0.02);
    model.add(wall, lever, hinge);
    [-1.95, -0.65, 0.65, 1.95].forEach((x, index) => {
      const slot = new Group();
      slot.name = `slot_${index}`;
      slot.position.set(x, 0.3, 0.44);
      slot.scale.setScalar(0.52);
      model.add(slot);
    });
    return { model, stone, wall, lever };
  }

  it('stands four cards on its 5.6 m ledge, 1.3 m apart at 0.52 scale, and staggers them', () => {
    const wall = new FeedWall();
    expect(wall.cards).toHaveLength(4);
    wall.cards.forEach((card, index) => {
      expect(card.object.parent).toBe(wall.object);
      expect(card.object.position.x).toBeCloseTo([-1.95, -0.65, 0.65, 1.95][index], 6);
      expect(card.object.position.y).toBeCloseTo(0.3, 6);
      expect(card.object.position.z).toBeCloseTo(0.44, 6);
      expect(card.object.scale.x).toBeCloseTo(0.52, 6);
    });
    // The whole row fits on the wall, stands included.
    const span = 1.95 * 2 + 2.1 * 0.52;
    expect(span).toBeLessThan(5.6);

    wall.dispose();
    expect(wall.object.children).toHaveLength(0);
  });

  it('stands a procedural wall behind the cards until the model arrives', () => {
    const wall = new FeedWall();

    const proxy = wall.object.getObjectByName('feed-wall-proxy') as Mesh<BoxGeometry>;
    expect(proxy).toBeInstanceOf(Mesh);
    expect(proxy.geometry.parameters.width).toBeCloseTo(5.6, 6);
    expect(proxy.geometry.parameters.height).toBeCloseTo(2.6, 6);
    expect(wall.lever.position.toArray()).toEqual([3.18, 1.12, 0.02]);
    expect(wall.lever.children.length).toBeGreaterThan(0);
    wall.dispose();
  });

  it('stands the procedural wall and lever in the same haze while the model is on its way', () => {
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const wall = new FeedWall();
    wall.loadModel(new StubAssets(), false, haze);

    for (const name of ['feed-wall-proxy', 'feed-wall-proxy-pier', 'feed-wall-proxy-lever']) {
      const mesh = wall.object.getObjectByName(name) as Mesh;
      expect((mesh.material as MeshStandardMaterial).customProgramCacheKey(), name).toContain(
        'atmosphere',
      );
    }
    wall.dispose();
  });

  it('loads feed-wall.glb once: cards into its slots, the lever onto its hinge, stone hazed', async () => {
    const assets = new StubAssets();
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const wall = new FeedWall();
    wall.loadModel(assets, false, haze);
    wall.loadModel(assets, false, haze);
    expect(assets.requested).toEqual([FEED_WALL_MODEL]);

    const { model, stone, wall: body, lever } = wallModel();
    await assets.resolve(model);

    expect(wall.object.getObjectByName('feed-wall-proxy')).toBeUndefined();
    expect(model.parent).toBe(wall.object);
    expect(body.material).toBe(haze.of(stone));
    expect(lever.parent).toBe(wall.lever);
    // Only the authored placement came off: the dequantising offset and scale stay.
    expect(lever.position.y).toBeCloseTo(1.569 - 1.12, 6);
    expect(lever.scale.x).toBeCloseTo(0.501, 6);
    const world = new Vector3();
    wall.object.updateMatrixWorld(true);
    expect(lever.getWorldPosition(world).y).toBeCloseTo(1.569, 6);
    wall.cards.forEach((card, index) => {
      const slot = model.getObjectByName(`slot_${index}`)!;
      expect(card.object.position.toArray()).toEqual(slot.position.toArray());
      expect(card.object.scale.x).toBeCloseTo(0.52, 6);
    });

    wall.dispose();
    wall.dispose();
    expect(assets.releasedModels).toEqual([FEED_WALL_MODEL]);
  });

  it('reads the slots and the hinge wherever they hang in the model, and says when it placed them', async () => {
    const assets = new StubAssets();
    const wall = new FeedWall();
    const onPlaced = vi.fn();
    wall.setSwitch('on');
    wall.update(5);
    wall.loadModel(assets, false, undefined, onPlaced);

    // The same model, its empties and lever nested one level down under an offset group.
    const { model } = wallModel();
    const nest = new Group();
    nest.position.set(0.5, 0.1, -0.2);
    [...model.children]
      .filter((child) => child.name !== 'feed-wall')
      .forEach((child) => nest.add(child));
    model.add(nest);
    await assets.resolve(model);

    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(wall.cards[0].object.position.x).toBeCloseTo(-1.95 + 0.5, 6);
    expect(wall.cards[0].object.position.y).toBeCloseTo(0.3 + 0.1, 6);
    expect(wall.cards[0].object.scale.x).toBeCloseTo(0.52, 6);
    expect(wall.lever.position.x).toBeCloseTo(3.18 + 0.5, 6);
    expect(wall.lever.position.y).toBeCloseTo(1.12 + 0.1, 6);
    // Adopted at the pivot's rest even though it was thrown: upright when switched back.
    const lever = wall.lever.getObjectByName('lever')!;
    expect(lever.position.y).toBeCloseTo(1.569 - 1.12, 6);
    expect(lever.position.x).toBeCloseTo(0, 6);
    wall.setSwitch('rest');
    wall.update(5);
    wall.object.updateMatrixWorld(true);
    expect(lever.getWorldPosition(new Vector3()).y).toBeCloseTo(1.569 + 0.1, 6);
    wall.dispose();
  });

  it('throws its lever about the hinge’s x axis: upright at rest, one way on, the other off', () => {
    const wall = new FeedWall();
    expect(wall.lever.rotation.x).toBe(0);

    wall.setSwitch('on');
    wall.update(2);
    const on = wall.lever.rotation.x;
    expect(Math.abs(on)).toBeGreaterThan(0.3);

    wall.setSwitch('off');
    wall.update(0.05);
    expect(wall.lever.rotation.x).not.toBe(on);
    wall.update(2);
    expect(wall.lever.rotation.x).toBeCloseTo(-on, 6);
    expect(wall.lever.rotation.y).toBe(0);
    expect(wall.lever.rotation.z).toBe(0);

    wall.setSwitch('rest');
    wall.update(2);
    expect(wall.lever.rotation.x).toBe(0);
    wall.dispose();
  });

  it('snaps its lever under reduced motion', () => {
    const wall = new FeedWall({ reducedMotion: () => true });

    wall.setSwitch('off');
    wall.update(1 / 60);

    expect(Math.abs(wall.lever.rotation.x)).toBeGreaterThan(0.3);
    wall.dispose();
  });

  it('blocks the wall with its ledge and the lever’s pier, turned and placed with it', () => {
    const wall = new FeedWall();
    wall.object.position.set(8.4, 0.5, -13);
    wall.object.updateMatrixWorld(true);

    const boxes = wall.colliders();
    const covers = (x: number, z: number) =>
      boxes.some(
        (box) =>
          box.kind === 'aabb' && x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ,
      );
    expect(covers(8.4 - 2.7, -13)).toBe(true);
    expect(covers(8.4 + 2.7, -13 + 0.5)).toBe(true);
    expect(covers(8.4 + 3.18, -13)).toBe(true);
    expect(covers(8.4, -13 + 0.6)).toBe(false);
    expect(covers(8.4, -13 - 0.3)).toBe(false);
    wall.dispose();
  });

  it('releases a model that arrives after dispose without adding it', async () => {
    const assets = new StubAssets();
    const wall = new FeedWall();
    wall.loadModel(assets);
    wall.dispose();

    const { model } = wallModel();
    await assets.resolve(model);

    expect(assets.releasedModels).toEqual([FEED_WALL_MODEL]);
    expect(model.parent).toBeNull();
  });
});

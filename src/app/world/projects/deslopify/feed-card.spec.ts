import {
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BADGE, FEED_CARDS } from './deslopify.data';
import { FeedCard, FeedWall } from './feed-card';

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
    expect(shader.fragmentShader).toContain('smoothstep(1.0, 0.96, uWipe)');
    expect(shader.fragmentShader).toContain('vec3(1.0, 0.6, 0.22) * 4.0');
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');

    card.dispose();
    canvas.restore();
  });

  it('wipes from slop to original in 0.36 seconds', () => {
    const card = new FeedCard(FEED_CARDS[0]);

    card.setOriginal(true);
    card.update(0.18);
    expect(card.wipe).toBeCloseTo(0.5, 8);
    expect(card.original).toBe(false);
    card.update(0.18);
    expect(card.wipe).toBeCloseTo(1, 8);
    expect(card.original).toBe(true);

    card.dispose();
  });

  it('waits through requested delay before starting its wipe', () => {
    const card = new FeedCard(FEED_CARDS[0]);

    card.setOriginal(true, 0.2);
    card.update(0.19);
    expect(card.wipe).toBe(0);
    card.update(0.01);
    expect(card.wipe).toBe(0);
    card.update(0.18);
    expect(card.wipe).toBeCloseTo(0.5, 8);

    card.dispose();
  });

  it('snaps immediately under reduced motion, including a delayed request', () => {
    const card = new FeedCard(FEED_CARDS[0], { reducedMotion: () => true });

    card.setOriginal(true, 10);
    expect(card.wipe).toBe(1);
    expect(card.original).toBe(true);
    card.setOriginal(false, 10);
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
  it('centres four cards at 2.4 metre spacing and staggers transitions', () => {
    const wall = new FeedWall();
    expect(wall.cards).toHaveLength(4);
    expect(wall.object.children).toHaveLength(4);
    wall.cards
      .map((card) => card.object.position.x)
      .forEach((x, index) => {
        expect(x).toBeCloseTo([-3.6, -1.2, 1.2, 3.6][index]);
      });

    wall.setOriginal(true, 0.12);
    wall.update(0.12);
    expect(wall.cards.map((card) => card.wipe)).toEqual([1 / 3, 0, 0, 0]);
    wall.update(0.12);
    expect(wall.cards.map((card) => card.wipe)).toEqual([2 / 3, 1 / 3, 0, 0]);

    wall.dispose();
    expect(wall.object.children).toHaveLength(0);
  });
});

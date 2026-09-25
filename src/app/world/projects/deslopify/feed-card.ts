import type { AssetLike } from '@engine/asset.service';
import type { Material, Object3D } from 'three';
import type { Collider } from '@engine/player/collision';
import { transformIn } from '../../environments/model-geometry';
import type { HazedCopies } from '../../environments/shaders/hazed-copies';
import {
  BoxGeometry,
  CanvasTexture,
  Matrix4,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { disposeObject3D } from '@engine/dispose';
import type { FeedCardData } from './deslopify.data';
import { BADGE, FEED_CARDS, PALETTE } from './deslopify.data';

/**
 * The card's timber stand, modelled in Blender (scripts/blender/models/card_frame.py): posts,
 * rails, backing boards and a little gable round the face, which stays this card's own.
 */
export const CARD_FRAME_MODEL = 'assets/models/card-frame.glb';

/**
 * The feed wall, modelled in Blender (scripts/blender/models/feed_wall.py): a dry-stone wall
 * 5.6 m wide and 2.6 m tall facing +z, a ledge along its foot that four `slot_0` … `slot_3`
 * empties stand the cards on (each carrying the cards' 0.52 scale), and the switch `lever` on a
 * pier to its right, turning about x at the `lever_hinge` empty. The lever node's own position
 * carries the optimiser's dequantising offset, so the hinge is read from the empty, never from it.
 */
export const FEED_WALL_MODEL = 'assets/models/feed-wall.glb';

const FRAME_WIDTH = 2.1;
const FRAME_HEIGHT = 1.98;
const FRAME_DEPTH = 0.14;
const FRAME_RADIUS = 0.05;
const FACE_WIDTH = 1.92;
const FACE_HEIGHT = 1.8;
const FACE_Y = 2.05;
const FACE_Z = 0.075;
const POST_X = 0.85;
const POST_Y = 0.55;
const POST_Z = -0.04;
const POST_HEIGHT = 1.3;
/** The wall's measures, in its own frame, as its model builds them. */
const WALL_SIZE = { width: 5.6, height: 2.6, depth: 0.5, ledgeTop: 0.3, ledgeFront: 0.64 } as const;
/** Where the cards stand on the ledge: 1.3 m apart, shrunk to fit four across the wall. */
const WALL_CARD = { pitch: 1.3, y: WALL_SIZE.ledgeTop, z: 0.44, scale: 0.52 } as const;
/**
 * How far in front of the wall the block a visitor walks into reaches: the card stands' front on
 * the ledge. The ledge's stones round off beyond it, too low to matter, so station 6's stand a
 * metre off the wall keeps a real margin.
 */
const BLOCK_FRONT = 0.58;
/** The switch's pier, right of the wall, and the hinge its lever turns on. */
const PIER = { x: 3.18, width: 0.56, depth: 0.52 } as const;
const LEVER_HINGE = new Vector3(3.18, 1.12, 0.02);
/** Radians the lever leans from upright when switched, and how fast it swings there. */
const LEVER_THROW = 0.55;
const LEVER_RATE = 3;
const STONE = 0x8f8878;

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 600;
const THUMBNAIL = { x: 24, y: 24, width: 592, height: 333, radius: 12 } as const;
const INNER = '#f4f2ee';
const FONT_BARLOW = '"Barlow", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
const CARD_FONTS = [
  '800 140px "Barlow"',
  '700 38px "Barlow"',
  '500 26px "Barlow"',
  '500 24px "IBM Plex Mono"',
];

export interface FeedWallOptions {
  /** Whether the lever cuts to its position rather than swinging there. */
  readonly reducedMotion?: () => boolean;
}

interface WipeUniform {
  value: number;
}

/**
 * One standing bilingual feed card with a shader wipe between its two canvas faces. The wipe is
 * the flow's for this card, handed over each frame, so it runs at the flow's rates in and out and
 * snaps with it under reduced motion.
 */
export class FeedCard {
  readonly object = new Group();

  private readonly slopTexture: CanvasTexture;
  private readonly originalTexture: CanvasTexture;
  private readonly wipeUniform: WipeUniform = { value: 0 };
  private disposed = false;
  /** The procedural frame and posts, until the stand model replaces them. */
  private proxy: Mesh[] = [];
  private frameModel: Group | null = null;
  private assets: AssetLike | null = null;

  constructor(data: FeedCardData) {
    this.object.name = 'feed-card';

    const frame = new Mesh(
      new RoundedBoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, FRAME_DEPTH, 3, FRAME_RADIUS),
      new MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.82, metalness: 0.04 }),
    );
    frame.name = 'feed-card-frame';
    frame.position.y = FACE_Y;
    this.object.add(frame);
    this.proxy.push(frame);

    const postGeometry = new CylinderGeometry(0.07, 0.09, POST_HEIGHT, 12);
    const postMaterial = new MeshStandardMaterial({
      color: PALETTE.wood,
      roughness: 0.86,
      metalness: 0.02,
    });
    [-POST_X, POST_X].forEach((x, index) => {
      const post = new Mesh(postGeometry, postMaterial);
      post.name = `feed-card-post-${index}`;
      post.position.set(x, POST_Y, POST_Z);
      this.object.add(post);
      this.proxy.push(post);
    });

    this.slopTexture = createCardTexture(data, false);
    this.originalTexture = createCardTexture(data, true);
    const faceMaterial = this.createFaceMaterial();
    faceMaterial.userData['originalMap'] = this.originalTexture;
    faceMaterial.userData['slopMap'] = this.slopTexture;
    faceMaterial.userData['uWipe'] = this.wipeUniform;

    const face = new Mesh(new PlaneGeometry(FACE_WIDTH, FACE_HEIGHT), faceMaterial);
    face.name = 'feed-card-face';
    face.position.set(0, FACE_Y, FACE_Z);
    this.object.add(face);
  }

  /**
   * Asks for the stand model and swaps it in for the procedural frame when it arrives, hazed into
   * the environment's air when `haze` is given. Without the model the procedural frame stays.
   */
  loadFrame(assets: AssetLike, castShadow = false, haze?: HazedCopies): void {
    if (this.disposed || this.assets) {
      return;
    }
    this.assets = assets;
    assets.model(CARD_FRAME_MODEL).then(
      (model) => {
        if (this.disposed || this.frameModel) {
          assets.releaseModel(CARD_FRAME_MODEL);
          return;
        }
        this.frameModel = model;
        model.name = 'feed-card-stand';
        model.traverse((object) => {
          if (object instanceof Mesh) {
            object.castShadow = castShadow;
            object.receiveShadow = castShadow;
            if (haze) {
              object.material = haze.of(object.material as Material);
            }
          }
        });
        // The two posts share one geometry and material: free them once.
        const [frame, ...posts] = this.proxy;
        frame?.removeFromParent();
        frame?.geometry.dispose();
        (frame?.material as MeshStandardMaterial | undefined)?.dispose();
        for (const post of posts) {
          post.removeFromParent();
        }
        posts[0]?.geometry.dispose();
        (posts[0]?.material as MeshStandardMaterial | undefined)?.dispose();
        this.proxy = [];
        this.object.add(model);
      },
      () => undefined,
    );
  }

  get original(): boolean {
    return this.wipeUniform.value > 0.5;
  }

  get wipe(): number {
    return this.wipeUniform.value;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.frameModel) {
      // The asset service owns the stand's resources; `disposeObject3D` leaves them alone.
      this.frameModel = null;
      this.assets?.releaseModel(CARD_FRAME_MODEL);
    }
    this.proxy = [];
    // `disposeObject3D` sees the original map through MeshBasicMaterial.map. The translated map is
    // deliberately stored in userData for the shader, so release it explicitly here.
    this.slopTexture.dispose();
    disposeObject3D(this.object);
    this.object.clear();
  }

  /** Shows the wipe at `value`, 0 slop … 1 original; the seam runs while it is in between. */
  setWipe(value: number): void {
    this.wipeUniform.value = Math.min(1, Math.max(0, value));
  }

  private createFaceMaterial(): MeshBasicMaterial {
    const material = new MeshBasicMaterial({
      map: this.originalTexture,
      fog: true,
      toneMapped: true,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uWipe'] = this.wipeUniform;
      shader.uniforms['uOriginalMap'] = { value: this.originalTexture };
      shader.uniforms['uSlopMap'] = { value: this.slopTexture };

      const declarations = [
        'uniform float uWipe;',
        'uniform sampler2D uOriginalMap;',
        'uniform sampler2D uSlopMap;',
      ].join('\n');
      if (shader.fragmentShader.includes('#include <common>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>\n${declarations}`,
        );
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          `${declarations}\nvoid main() {`,
        );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
          float e = uWipe * 1.08 - .04;
          vec4 originalColor = texture2D(uOriginalMap, vMapUv);
          vec4 slopColor = texture2D(uSlopMap, vMapUv);
          float showOriginal = step(vMapUv.x, e);
          diffuseColor = mix(slopColor, originalColor, showOriginal);
          // The amber seam exists only while the wipe runs, not as a glowing edge at rest.
          float seam = exp(-abs(vMapUv.x - e) * 70.0) * smoothstep(0.0, 0.04, uWipe) * (1.0 - smoothstep(0.96, 1.0, uWipe));
          diffuseColor.rgb += seam * vec3(1.0, 0.6, 0.22) * 4.0;
        `,
      );
    };
    return material;
  }
}

/** Where the wall's switch stands: upright before install, then one way on and the other off. */
export type WallSwitch = 'rest' | 'on' | 'off';

/**
 * The feed wall on the north glade: four canonical cards on the ledge of a stone wall, and the
 * lever beside it that turns Deslopify off and on. The wall is `feed-wall.glb` once it arrives; a
 * plain stone block stands in until then, and for good if it never does, with the cards and the
 * lever already where the model puts them.
 */
export class FeedWall {
  readonly object = new Group();
  readonly cards: readonly FeedCard[];
  /** The lever's pivot, standing at the hinge: its x rotation is the switch's throw. */
  readonly lever = new Group();

  private readonly reducedMotion: () => boolean;
  private proxy: Mesh[] = [];
  private model: Group | null = null;
  private assets: AssetLike | null = null;
  private disposed = false;
  private leverTarget = 0;

  constructor(options: FeedWallOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? (() => false);
    this.object.name = 'feed-wall';
    this.cards = FEED_CARDS.map((data, index) => {
      const card = new FeedCard(data);
      card.object.position.set(
        (index - (FEED_CARDS.length - 1) / 2) * WALL_CARD.pitch,
        WALL_CARD.y,
        WALL_CARD.z,
      );
      card.object.scale.setScalar(WALL_CARD.scale);
      this.object.add(card.object);
      return card;
    });

    this.lever.name = 'feed-wall-lever';
    this.lever.position.copy(LEVER_HINGE);
    this.object.add(this.lever);
    this.buildProxy();
  }

  /**
   * Asks for the wall's model and swaps it in for the stone block when it arrives, hazed into the
   * environment's air when `haze` is given: the cards move to its slots, its lever to the hinge.
   * `onPlaced` hears when the cards have moved, so whatever tracks where they stand can follow.
   */
  loadModel(
    assets: AssetLike,
    castShadow = false,
    haze?: HazedCopies,
    onPlaced?: () => void,
  ): void {
    if (this.disposed || this.assets) {
      return;
    }
    this.assets = assets;
    assets.model(FEED_WALL_MODEL).then(
      (model) => {
        if (this.placeModel(model, castShadow, haze)) {
          onPlaced?.();
        }
      },
      () => undefined,
    );
  }

  /** Where the lever should stand; it swings there over the next frames. */
  setSwitch(position: WallSwitch): void {
    this.leverTarget = position === 'on' ? LEVER_THROW : position === 'off' ? -LEVER_THROW : 0;
  }

  update(dt: number): void {
    const angle = this.lever.rotation.x;
    if (angle !== this.leverTarget) {
      const step = this.reducedMotion() ? Infinity : LEVER_RATE * Math.max(0, dt);
      this.lever.rotation.x =
        Math.abs(this.leverTarget - angle) <= step
          ? this.leverTarget
          : angle + Math.sign(this.leverTarget - angle) * step;
    }
  }

  /**
   * What a visitor walks into, in world space, from where the wall stands now: the wall with its
   * ledge and the cards on it as one block, and the lever's pier. Call once the wall is placed.
   */
  colliders(): Collider[] {
    const half = WALL_SIZE.width / 2;
    return [
      this.worldBox(-half - 0.05, half + 0.05, -WALL_SIZE.depth / 2, BLOCK_FRONT),
      this.worldBox(
        PIER.x - PIER.width / 2,
        PIER.x + PIER.width / 2,
        -PIER.depth / 2,
        PIER.depth / 2,
      ),
    ];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cards.forEach((card) => card.dispose());
    if (this.model) {
      // The asset service owns the model's resources; only the reference goes.
      this.model = null;
      this.assets?.releaseModel(FEED_WALL_MODEL);
    }
    this.disposeProxy();
    this.lever.clear();
    this.object.clear();
  }

  /** The stone block, its ledge, the pier and a plain lever, where the model will put its own. */
  private buildProxy(): void {
    const stone = new MeshStandardMaterial({ color: STONE, roughness: 0.92 });
    const block = (name: string, size: [number, number, number], at: [number, number, number]) => {
      const mesh = new Mesh(new BoxGeometry(...size), stone);
      mesh.name = name;
      mesh.position.set(...at);
      this.proxy.push(mesh);
      return mesh;
    };
    const { width, height, depth, ledgeTop, ledgeFront } = WALL_SIZE;
    this.object.add(
      block('feed-wall-proxy', [width, height, depth], [0, height / 2, 0]),
      block(
        'feed-wall-proxy-ledge',
        [width + 0.1, ledgeTop, ledgeFront - depth / 2],
        [0, ledgeTop / 2, (ledgeFront + depth / 2) / 2],
      ),
      block(
        'feed-wall-proxy-pier',
        [PIER.width, LEVER_HINGE.y - 0.06, PIER.depth],
        [PIER.x, (LEVER_HINGE.y - 0.06) / 2, 0],
      ),
    );
    const handle = new Mesh(
      new BoxGeometry(0.07, 0.9, 0.07),
      new MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 }),
    );
    handle.name = 'feed-wall-proxy-lever';
    handle.position.y = 0.5;
    this.proxy.push(handle);
    this.lever.add(handle);
  }

  private disposeProxy(): void {
    const materials = new Set<Material>();
    for (const mesh of this.proxy) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      materials.add(mesh.material as Material);
    }
    materials.forEach((material) => material.dispose());
    this.proxy = [];
  }

  /**
   * Stands the model in the wall's frame and moves the cards and the lever to where it says; the
   * empties are read wherever they hang in its tree. `false` if it came too late or twice.
   */
  private placeModel(model: Group, castShadow: boolean, haze?: HazedCopies): boolean {
    if (this.disposed || this.model) {
      this.assets?.releaseModel(FEED_WALL_MODEL);
      return false;
    }
    this.model = model;
    this.disposeProxy();
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = castShadow;
        object.receiveShadow = castShadow;
        if (haze) {
          object.material = haze.of(object.material as Material);
        }
      }
    });
    this.object.add(model);
    const placement = new Matrix4();
    this.cards.forEach((card, index) => {
      const slot = model.getObjectByName(`slot_${index}`);
      if (slot) {
        transformIn(slot, this.object, placement).decompose(
          card.object.position,
          card.object.quaternion,
          card.object.scale,
        );
      }
    });
    const hingeNode = model.getObjectByName('lever_hinge');
    const hinge = hingeNode
      ? new Vector3().setFromMatrixPosition(transformIn(hingeNode, this.object, placement))
      : LEVER_HINGE.clone();
    this.lever.position.copy(hinge);
    const lever: Object3D | undefined = model.getObjectByName('lever');
    if (lever) {
      // Into the pivot at its rest: the hinge's offset comes off, the optimiser's own transform
      // (its dequantising offset and scale) stays, and the pivot's throw then turns it.
      const rest = new Matrix4()
        .makeTranslation(-hinge.x, -hinge.y, -hinge.z)
        .multiply(transformIn(lever, this.object, placement));
      this.lever.add(lever);
      rest.decompose(lever.position, lever.quaternion, lever.scale);
    }
    this.object.updateMatrixWorld(true);
    return true;
  }

  /** The world box round the wall-frame rectangle x0…x1, z0…z1, as the wall stands now. */
  private worldBox(x0: number, x1: number, z0: number, z1: number): Collider {
    this.object.updateMatrixWorld(true);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const corner = new Vector3();
    for (const x of [x0, x1]) {
      for (const z of [z0, z1]) {
        this.object.localToWorld(corner.set(x, 0, z));
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minZ = Math.min(minZ, corner.z);
        maxZ = Math.max(maxZ, corner.z);
      }
    }
    return { kind: 'aabb', minX, maxX, minZ, maxZ };
  }
}

function createCardTexture(data: FeedCardData, original: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (context) {
    drawCard(context, data, original);
    // Drawn at once in the fallback faces, and again once the self-hosted fonts are in.
    const fonts = document.fonts;
    if (fonts) {
      Promise.all(CARD_FONTS.map((font) => fonts.load(font))).then(
        () => {
          drawCard(context, data, original);
          texture.needsUpdate = true;
        },
        () => undefined,
      );
    }
  }
  return texture;
}

/** Ported from the lookdev's `cardTexture`: the parts people recognise from a video feed. */
function drawCard(context: CanvasRenderingContext2D, data: FeedCardData, original: boolean): void {
  const accent = original ? PALETTE.original : PALETTE.slop;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = accent;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  fillRoundedRect(context, 8, 8, 624, 584, 18, INNER);

  // The thumbnail: the creator's own artwork, with the translated title burned over it when slop.
  context.save();
  roundedPath(
    context,
    THUMBNAIL.x,
    THUMBNAIL.y,
    THUMBNAIL.width,
    THUMBNAIL.height,
    THUMBNAIL.radius,
  );
  context.clip();
  context.fillStyle = data.bg;
  context.fillRect(THUMBNAIL.x, THUMBNAIL.y, THUMBNAIL.width, THUMBNAIL.height);
  context.fillStyle = data.wordColor;
  context.font = `800 ${data.word.length > 8 ? 86 : 140}px ${FONT_BARLOW}`;
  context.fillText(data.word, 48, 40);
  if (data.sub) {
    context.fillStyle = PALETTE.ink;
    context.font = `500 30px ${FONT_MONO}`;
    context.fillText(data.sub, 54, 196);
  }
  if (!original) {
    context.save();
    context.translate(40, 110);
    context.rotate(-0.05);
    context.font = 'bold 50px Arial, sans-serif';
    const width = context.measureText(data.slopThumb).width + 36;
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(0, 6, width, 70);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, 70);
    context.fillStyle = '#111111';
    context.fillText(data.slopThumb, 18, 10);
    context.restore();
    fillRoundedRect(context, 38, 38, 170, 40, 6, PALETTE.slop);
    context.fillStyle = '#ffffff';
    context.font = '700 24px system-ui, sans-serif';
    context.fillText('KI-übersetzt', 52, 46);
  }
  fillRoundedRect(context, 520, 310, 84, 36, 6, 'rgba(0, 0, 0, 0.82)');
  context.fillStyle = '#ffffff';
  context.font = `500 24px ${FONT_MONO}`;
  context.fillText(data.duration, 532, 316);
  context.restore();

  context.fillStyle = data.avatarBg;
  context.beginPath();
  context.arc(62, 412, 30, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `700 30px ${FONT_BARLOW}`;
  context.textAlign = 'center';
  context.fillText(data.avatar, 62, 396);
  context.textAlign = 'left';

  context.fillStyle = '#16202a';
  context.font = `700 38px ${FONT_BARLOW}`;
  drawWrapped(context, original ? data.original : data.slop, 108, 380, 500, 44, 'left');
  // The metadata stays German in both states: the extension restores the creator's content and
  // leaves the viewer's own interface language alone.
  context.fillStyle = '#5b6670';
  context.font = `500 26px ${FONT_BARLOW}`;
  context.fillText(data.meta, 108, 478);

  const badge = original ? BADGE.original : BADGE.translated;
  context.font = '700 22px system-ui, sans-serif';
  const badgeWidth = context.measureText(badge).width + 30;
  fillRoundedRect(context, 108, 522, badgeWidth, 40, 20, accent);
  context.fillStyle = original ? '#1a1408' : '#ffffff';
  context.fillText(badge, 123, 530);
}

function drawWrapped(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign,
): number {
  context.textAlign = align;
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = candidate;
    }
  });
  if (line) {
    context.fillText(line, x, lineY);
    lineY += lineHeight;
  }
  return lineY;
}

function roundedPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  colour: string,
): void {
  context.fillStyle = colour;
  roundedPath(context, x, y, width, height, radius);
  context.fill();
}

import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { disposeObject3D } from '@engine/dispose';
import type { FeedCardData } from './deslopify.data';
import { BADGE, FEED_CARDS, PALETTE } from './deslopify.data';

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
const WIPE_SECONDS = 0.36;
const WIPE_RATE = 1 / WIPE_SECONDS;
const CARD_SPACING = 2.4;

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

export interface FeedCardOptions {
  readonly reducedMotion?: () => boolean;
}

export type FeedWallOptions = FeedCardOptions;

interface WipeUniform {
  value: number;
}

/** One standing bilingual feed card with a shader wipe between its two canvas faces. */
export class FeedCard {
  readonly object = new Group();

  private readonly slopTexture: CanvasTexture;
  private readonly originalTexture: CanvasTexture;
  private readonly wipeUniform: WipeUniform = { value: 0 };
  private readonly reducedMotion: () => boolean;
  private target = 0;
  private delay = 0;
  private disposed = false;

  constructor(data: FeedCardData, options: FeedCardOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? (() => false);
    this.object.name = 'feed-card';

    const frame = new Mesh(
      new RoundedBoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, FRAME_DEPTH, 3, FRAME_RADIUS),
      new MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.82, metalness: 0.04 }),
    );
    frame.name = 'feed-card-frame';
    frame.position.y = FACE_Y;
    this.object.add(frame);

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

  get original(): boolean {
    return this.wipeUniform.value > 0.5;
  }

  get wipe(): number {
    return this.wipeUniform.value;
  }

  setOriginal(on: boolean, delaySeconds = 0): void {
    this.target = on ? 1 : 0;
    this.delay = Math.max(0, delaySeconds);
    if (this.reducedMotion()) {
      this.delay = 0;
      this.setWipe(this.target);
    }
  }

  update(dt: number): void {
    if (this.reducedMotion()) {
      this.delay = 0;
      this.setWipe(this.target);
      return;
    }

    let remaining = Math.max(0, dt);
    if (this.delay > 0) {
      if (remaining <= this.delay) {
        this.delay -= remaining;
        return;
      }
      remaining -= this.delay;
      this.delay = 0;
    }

    if (remaining === 0 || this.wipeUniform.value === this.target) {
      return;
    }
    const distance = Math.min(
      remaining * WIPE_RATE,
      Math.abs(this.target - this.wipeUniform.value),
    );
    this.setWipe(
      this.wipeUniform.value + Math.sign(this.target - this.wipeUniform.value) * distance,
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // `disposeObject3D` sees the original map through MeshBasicMaterial.map. The translated map is
    // deliberately stored in userData for the shader, so release it explicitly here.
    this.slopTexture.dispose();
    disposeObject3D(this.object);
    this.object.clear();
  }

  private setWipe(value: number): void {
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

/** Four canonical cards arranged as a centred row. */
export class FeedWall {
  readonly object = new Group();
  readonly cards: readonly FeedCard[];

  constructor(options: FeedWallOptions = {}) {
    this.object.name = 'feed-wall';
    this.cards = FEED_CARDS.map((data, index) => {
      const card = new FeedCard(data, options);
      card.object.position.x = (index - (FEED_CARDS.length - 1) / 2) * CARD_SPACING;
      this.object.add(card.object);
      return card;
    });
  }

  setOriginal(on: boolean, stagger = 0.12): void {
    this.cards.forEach((card, index) => card.setOriginal(on, index * Math.max(0, stagger)));
  }

  update(dt: number): void {
    this.cards.forEach((card) => card.update(dt));
  }

  dispose(): void {
    this.cards.forEach((card) => card.dispose());
    this.object.clear();
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

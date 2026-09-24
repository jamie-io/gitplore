import {
  BufferGeometry,
  CanvasTexture,
  FrontSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { SLOP_TAGS, SlopTagData } from './deslopify.data';

const TAG_WIDTH = 0.9;
const TAG_HEIGHT = 0.42;
const TAG_FONTS = ['500 24px "IBM Plex Mono"', '700 50px "Barlow Semi Condensed"'];
const FLIP_FORWARD_RATE = 2.6;
const FLIP_BACK_RATE = 1.4;

export interface SlopTagsOptions {
  readonly anchors: readonly Vector3[];
  readonly reducedMotion?: boolean | (() => boolean);
}

interface TagState {
  readonly anchor: Vector3;
  readonly hang: Group;
  readonly tag: Group;
  readonly phase: number;
  w: number;
}

/** Canvas-backed metadata tags hanging below the slop canopy. */
export class SlopTags {
  readonly object = new Group();

  private readonly tags: TagState[] = [];
  private readonly textures: CanvasTexture[] = [];
  private readonly reducedMotion: () => boolean;
  private time = 0;

  constructor(options: SlopTagsOptions) {
    this.reducedMotion = motionFlag(options.reducedMotion);
    this.object.name = 'slop-tags';
    this.object.userData['tagCount'] = options.anchors.length;

    if (options.anchors.length === 0) return;

    const planeGeometry = new PlaneGeometry(TAG_WIDTH, TAG_HEIGHT);
    const stringMaterial = new LineBasicMaterial({ color: 0x241323 });
    options.anchors.forEach((sourceAnchor, index) => {
      const anchor = sourceAnchor.clone();
      const hang = new Group();
      hang.name = `slop-tag:${index}`;
      hang.position.copy(anchor);
      hang.userData['anchor'] = anchor.clone();

      const leftString = stringLine(-0.28, 0, -0.3, stringMaterial);
      const rightString = stringLine(0.28, 0, -0.3, stringMaterial);
      hang.add(leftString, rightString);

      const data = SLOP_TAGS[index % SLOP_TAGS.length]!;
      const tag = new Group();
      tag.name = `slop-tag-face:${index}`;
      tag.position.y = -0.55;
      const slopMaterial = faceMaterial(data, false);
      const originalMaterial = faceMaterial(data, true);
      this.textures.push(slopMaterial.map as CanvasTexture, originalMaterial.map as CanvasTexture);
      const slop = new Mesh(planeGeometry, slopMaterial);
      const original = new Mesh(planeGeometry, originalMaterial);
      slop.position.z = 0.004;
      original.position.z = -0.004;
      original.rotation.y = Math.PI;
      slop.name = `slop-tag-slop:${index}`;
      original.name = `slop-tag-original:${index}`;
      tag.add(slop, original);
      hang.add(tag);
      this.object.add(hang);
      this.tags.push({ anchor, hang, tag, phase: index * 1.7, w: 0 });
    });

    this.applyVisuals();
  }

  update(dt: number, isCleared: (index: number, anchor: Vector3) => boolean): void {
    const seconds = Math.max(0, dt);
    this.time += seconds;
    for (let index = 0; index < this.tags.length; index++) {
      const tag = this.tags[index]!;
      const cleared = isCleared(index, tag.anchor);
      tag.w = this.reducedMotion()
        ? cleared
          ? 1
          : 0
        : clamp(tag.w + (cleared ? FLIP_FORWARD_RATE : -FLIP_BACK_RATE) * seconds, 0, 1);
      tag.tag.userData['w'] = tag.w;
    }
    this.applyVisuals();
  }

  flipped(index: number): boolean {
    return (this.tags[index]?.w ?? 0) > 0.5;
  }

  dispose(): void {
    this.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material as MeshStandardMaterial;
      material.map = null;
      material.emissiveMap = null;
    });
    disposeObject3D(this.object);
    this.textures.splice(0).forEach((texture) => texture.dispose());
    this.object.clear();
  }

  private applyVisuals(): void {
    for (const tag of this.tags) {
      tag.tag.scale.x = Math.abs(Math.cos(tag.w * Math.PI));
      tag.tag.rotation.y = tag.w * Math.PI;
      tag.hang.rotation.z = this.reducedMotion()
        ? 0
        : Math.sin(this.time * 0.7 + tag.phase) * 0.025;
    }
  }
}

function stringLine(x: number, startY: number, endY: number, material: LineBasicMaterial): Line {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(x, startY, 0),
    new Vector3(x, endY, 0),
  ]);
  const line = new Line(geometry, material);
  line.name = 'slop-tag-string';
  return line;
}

function faceMaterial(data: SlopTagData, original: boolean): MeshStandardMaterial {
  const map = tagTexture(data, original);
  const material = new MeshStandardMaterial({
    map,
    roughness: 0.6,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.25,
    side: FrontSide,
  });
  material.userData['tagSide'] = original ? 'original' : 'slop';
  return material;
}

function tagTexture(data: SlopTagData, original: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (context) {
    drawTag(context, data, original);
    // Drawn at once in the fallback faces, and again once the self-hosted fonts are in.
    const fonts = document.fonts;
    if (fonts) {
      Promise.all(TAG_FONTS.map((font) => fonts.load(font))).then(
        () => {
          drawTag(context, data, original);
          texture.needsUpdate = true;
        },
        () => undefined,
      );
    }
  }
  return texture;
}

function drawTag(context: CanvasRenderingContext2D, data: SlopTagData, original: boolean): void {
  context.fillStyle = original ? '#e0a13c' : '#9a3f8d';
  roundRect(context, 0, 0, 512, 240, 22);
  context.fill();
  context.fillStyle = original ? '#5a3d27' : '#efe8ee';
  roundRect(context, 12, 12, 488, 216, 14);
  context.fill();
  context.textBaseline = 'top';
  context.fillStyle = original ? '#f4efe4' : '#7a2f70';
  context.font = '500 24px "IBM Plex Mono", monospace';
  context.fillText((original ? data.original : data.slop).toUpperCase(), 36, 38);
  context.fillStyle = original ? '#f4efe4' : '#1d1320';
  context.font = '700 50px "Barlow Semi Condensed", system-ui';
  wrap(context, original ? data.originalDetail : data.slopDetail, 36, 82, 440, 56);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function wrap(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  let line = '';
  let lineY = y;
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) context.fillText(line, x, lineY);
}

function motionFlag(value: boolean | (() => boolean) | undefined): () => boolean {
  return typeof value === 'function' ? value : () => value === true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

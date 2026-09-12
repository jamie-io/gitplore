import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import type { SceneObject } from '../../project/project.scene';

/**
 * What the sign over the counter says. The OCI 5.0 hand-off to the customer's own procurement
 * system is the part that makes this a B2B sales tool rather than a webshop, and it is the detail
 * a technical reader will look for.
 */
export const OCI_SIGN = 'OCI 5.0 — Übergabe an das Beschaffungssystem';

const WIDTH = 3.2;
const DEPTH = 0.9;
const HEIGHT = 1.05;
const SIGN_WIDTH = 3.2;
const SIGN_HEIGHT = 0.55;
const SIGN_Y = 2.4;
const CANVAS_WIDTH = 768;
const CANVAS_HEIGHT = 132;

const COUNTER_COLOUR = 0x3c4450;

export interface TradeCounterOptions {
  /** Ground-level centre of the counter. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
}

/** The trade counter at the end of the showroom, under its hand-off sign. */
export class TradeCounter implements SceneObject {
  readonly id = 'webkatalog:counter';
  readonly colliders: readonly Collider[];
  /** Ground-level centre, in world space. */
  readonly position: Vector3;

  private readonly group = new Group();
  private readonly options: TradeCounterOptions;
  private sign: MeshBasicMaterial | null = null;

  constructor(options: TradeCounterOptions) {
    this.options = options;
    this.position = options.origin.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);

    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = options.rotationY;

    // Square bounds around the counter: the rotation is shallow and the box is close to square,
    // so an axis-aligned box of the larger span blocks it without a corner a visitor can clip.
    const half = Math.max(WIDTH, DEPTH) / 2;
    this.colliders = [
      {
        kind: 'aabb',
        minX: this.position.x - half,
        maxX: this.position.x + half,
        minZ: this.position.z - half,
        maxZ: this.position.z + half,
      },
    ];
  }

  init(ctx: WorldContext): void {
    const body = new Mesh(
      new BoxGeometry(WIDTH, HEIGHT, DEPTH),
      new MeshStandardMaterial({ color: COUNTER_COLOUR, roughness: 0.7 }),
    );
    body.name = 'counter:body';
    body.position.set(0, HEIGHT / 2, 0);
    body.castShadow = ctx.quality.shadows;
    this.group.add(body);

    this.sign = signMaterial();
    const sign = new Mesh(new PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT), this.sign);
    sign.name = 'counter:sign';
    sign.position.set(0, SIGN_Y, DEPTH / 2 + 0.02);
    this.group.add(sign);

    ctx.scene.add(this.group);
  }

  update(): void {
    // The counter is scenery.
  }

  dispose(): void {
    this.sign?.map?.dispose();
    this.sign?.dispose();
    this.sign = null;
    disposeObject3D(this.group);
    this.group.clear();
  }
}

function signMaterial(): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: new Color('#f6f0ea') });
  }

  context.fillStyle = '#16202a';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = '#f6f0ea';
  context.font = 'bold 40px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(OCI_SIGN, 28, CANVAS_HEIGHT / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: texture });
}

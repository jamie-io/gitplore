import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
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
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext } from '@engine/world-object';
import type { SceneObject } from '../../project/project.scene';

/**
 * Three pieces from the fictional Nordwerk catalogue. Article numbers and prices are invented, and
 * are the point rather than decoration: what the repository actually does is pull product data —
 * prices, images, 3D configuration — out of the WebKatalog, so each bay carries its data beside it.
 */
export interface Bay {
  readonly article: string;
  readonly name: string;
  readonly price: string;
}

export const BAYS: readonly Bay[] = [
  { article: 'NW-1042', name: 'Regalwand Kontor', price: '2.380,00 €' },
  { article: 'NW-2071', name: 'Schreibtisch Nordwerk', price: '1.240,00 €' },
  { article: 'NW-3310', name: 'Besucherstuhl Falk', price: '410,00 €' },
];

/** The bay a visitor may reconfigure — the desk, because that is what the configurator sells. */
export const CONFIGURABLE = 1;

export interface BayMaterial {
  readonly label: string;
  readonly color: number;
  readonly price: string;
}

/** Finishes the configurator offers, each with the price the catalogue returns for it. */
export const MATERIALS: readonly BayMaterial[] = [
  { label: 'Eiche natur', color: 0x8f6a2f, price: '1.240,00 €' },
  { label: 'Nussbaum', color: 0x5a3a22, price: '1.480,00 €' },
  { label: 'Esche weiß', color: 0xd9cbb2, price: '1.160,00 €' },
];

const BAY_SPACING = 5;
const BAY_HALF_WIDTH = 1.5;
const BAY_HALF_DEPTH = 1.1;
const INTERACT_RADIUS = 3.5;

const CARD_WIDTH = 1.5;
const CARD_HEIGHT = 0.95;
const CARD_Y = 1.85;
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 324;

export interface CatalogueBaysOptions {
  /** Ground-level centre of the row. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
  readonly accent: string;
}

/**
 * The furnished bays in Nordwerk's showroom: a shelf, a desk and a chair, each with the article
 * number and price that the shop would have fetched for it. The desk can be reconfigured on the
 * spot, which is the shop's own party trick rendered in three dimensions.
 */
export class CatalogueBays implements SceneObject {
  readonly id = 'webkatalog:bays';
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];
  /** Ground-level centre of each bay, in world space. */
  readonly positions: readonly Vector3[];

  private readonly group = new Group();
  private readonly options: CatalogueBaysOptions;
  private readonly cardMaterials: MeshBasicMaterial[] = [];
  private chosen = 0;
  private desk: Mesh | null = null;
  private deskMaterial: MeshStandardMaterial | null = null;
  private card: Mesh | null = null;

  constructor(options: CatalogueBaysOptions) {
    this.options = options;
    this.group.name = this.id;
    this.group.position.copy(options.origin);
    this.group.rotation.y = options.rotationY;

    const rotation = new Euler(0, options.rotationY, 0);
    this.positions = BAYS.map((_, index) => {
      const offset = new Vector3(this.offsetX(index), 0, 0).applyEuler(rotation);
      const position = options.origin.clone().add(offset);
      position.y = options.ground.heightAt(position.x, position.z);
      return position;
    });

    this.colliders = this.positions.map((position) => ({
      kind: 'aabb' as const,
      minX: position.x - BAY_HALF_WIDTH,
      maxX: position.x + BAY_HALF_WIDTH,
      minZ: position.z - BAY_HALF_DEPTH,
      maxZ: position.z + BAY_HALF_DEPTH,
    }));

    this.interactables = [
      {
        id: `${this.id}:configure`,
        position: this.positions[CONFIGURABLE].clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Material wechseln',
        onInteract: () => this.configure(),
      },
    ];
  }

  /** The finish the configurable bay currently carries. */
  get material(): BayMaterial {
    return MATERIALS[this.chosen];
  }

  /** The colour the desk actually carries, so a test can prove the finish reached the geometry. */
  deskColour(): number | null {
    return this.deskMaterial?.color.getHex() ?? null;
  }

  private offsetX(index: number): number {
    return (index - (BAYS.length - 1) / 2) * BAY_SPACING;
  }

  init(ctx: WorldContext): void {
    const shadows = ctx.quality.shadows;
    const accent = new Color(this.options.accent);

    BAYS.forEach((bay, index) => {
      const x = this.offsetX(index);
      const piece =
        index === CONFIGURABLE ? this.buildDesk(accent) : this.buildPiece(index, accent);
      piece.position.set(x, piece.userData['centreY'] as number, 0);
      piece.castShadow = shadows;
      this.group.add(piece);

      const price = index === CONFIGURABLE ? this.material.price : bay.price;
      const material = specCard(bay, price, index === CONFIGURABLE ? this.material.label : null);
      const card = new Mesh(new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), material);
      card.name = `spec:${bay.article}`;
      card.position.set(x, CARD_Y, BAY_HALF_DEPTH + 0.02);
      this.group.add(card);
      this.cardMaterials.push(material);
      if (index === CONFIGURABLE) {
        this.card = card;
      }
    });

    ctx.scene.add(this.group);
  }

  /** Advances the configurable bay to the next finish, price and card together. */
  configure(): void {
    this.chosen = (this.chosen + 1) % MATERIALS.length;
    this.deskMaterial?.color.setHex(this.material.color);
    if (this.card) {
      const replacement = specCard(BAYS[CONFIGURABLE], this.material.price, this.material.label);
      const previous = this.card.material as MeshBasicMaterial;
      this.card.material = replacement;
      const slot = this.cardMaterials.indexOf(previous);
      if (slot >= 0) {
        this.cardMaterials[slot] = replacement;
      }
      previous.map?.dispose();
      previous.dispose();
    }
  }

  update(): void {
    // Nothing in the showroom moves; the configurator only changes on interaction.
  }

  dispose(): void {
    this.cardMaterials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.cardMaterials.length = 0;
    this.desk = null;
    this.deskMaterial = null;
    this.card = null;
    disposeObject3D(this.group);
    this.group.clear();
  }

  private buildDesk(accent: Color): Mesh {
    this.deskMaterial = new MeshStandardMaterial({ color: this.material.color, roughness: 0.6 });
    void accent;
    const desk = new Mesh(new BoxGeometry(2.4, 0.12, 1.1), this.deskMaterial);
    desk.name = 'bay:desk';
    desk.userData['centreY'] = 0.74;
    this.desk = desk;
    return desk;
  }

  /** The shelf wall and the visitor chair: plain blocks in the project's own colour. */
  private buildPiece(index: number, accent: Color): Mesh {
    const shelf = index === 0;
    const material = new MeshStandardMaterial({
      color: shelf ? accent.clone().multiplyScalar(0.8) : accent.clone().multiplyScalar(1.15),
      roughness: 0.75,
    });
    const geometry = shelf ? new BoxGeometry(2.6, 2.2, 0.5) : new BoxGeometry(0.7, 0.9, 0.7);
    const mesh = new Mesh(geometry, material);
    mesh.name = shelf ? 'bay:shelf' : 'bay:chair';
    mesh.userData['centreY'] = shelf ? 1.1 : 0.45;
    return mesh;
  }
}

/** An article card: number, name, price, and the chosen finish when there is one. */
function specCard(bay: Bay, price: string, finish: string | null): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: new Color('#f6f0ea') });
  }

  context.fillStyle = '#f6f0ea';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = '#8f6a2f';
  context.fillRect(0, 0, CANVAS_WIDTH, 10);

  context.fillStyle = '#6b6257';
  context.font = '26px ui-monospace, monospace';
  context.textBaseline = 'top';
  context.fillText(bay.article, 28, 40);

  context.fillStyle = '#16202a';
  context.font = 'bold 38px system-ui, sans-serif';
  context.fillText(bay.name, 28, 86);

  context.fillStyle = '#16202a';
  context.font = 'bold 44px system-ui, sans-serif';
  context.fillText(price, 28, 214);

  if (finish) {
    context.fillStyle = '#6b6257';
    context.font = '28px system-ui, sans-serif';
    context.fillText(finish, 28, 160);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: texture });
}

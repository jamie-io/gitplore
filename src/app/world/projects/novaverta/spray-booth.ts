import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import type { SceneObject } from '../../project/project.scene';

/**
 * The product the site exists to sell, quoted rather than invented: a NOVA VERTA spray booth with
 * the figures a brochure would carry. The repository is a dependency-free brochure site, so the
 * honest thing to render is the brochure's subject at full size, standing where you can walk into
 * it — the scale is what a screenshot of the site cannot give you.
 */
export const BOOTH = {
  model: 'NOVA VERTA Futura — Lackier- und Trockenkabine',
  specs: [
    ['Innenmaß', '7,00 × 4,00 × 2,90 m'],
    ['Luftleistung', '24.000 m³/h'],
    ['Filterstufe', 'Decke F5, Boden G3'],
    ['Trocknung', '60 °C, 30 min'],
  ] as const satisfies readonly (readonly [string, string])[],
} as const;

/** Interior dimensions, in metres; the walls stand outside these. */
const INNER_WIDTH = 7;
const INNER_DEPTH = 4;
const HEIGHT = 2.9;
const WALL = 0.25;

const PLATE_WIDTH = 2.4;
const PLATE_HEIGHT = 1.4;
const PLATE_Y = 1.7;

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 300;

export interface SprayBoothOptions {
  /** Ground-level centre of the booth's interior. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
  readonly accent: string;
}

/** A walk-in spray booth: three walls, a lit interior, and the model plate beside the opening. */
export class SprayBooth implements SceneObject {
  readonly id = 'novaverta:booth';
  readonly colliders: readonly Collider[];
  /** Ground-level centre of the open front, which nothing may block. */
  readonly opening: Vector3;

  private readonly group = new Group();
  private readonly options: SprayBoothOptions;
  private readonly centre: Vector3;
  private plate: MeshBasicMaterial | null = null;
  private light: PointLight | null = null;

  constructor(options: SprayBoothOptions) {
    this.options = options;
    this.centre = options.origin.clone();
    this.centre.y = options.ground.heightAt(this.centre.x, this.centre.z);

    this.group.name = this.id;
    this.group.position.copy(this.centre);
    this.group.rotation.y = options.rotationY;

    // The opening faces +Z in the booth's own frame; the walls are axis-aligned around it. The
    // booth is placed unrotated in practice, so axis-aligned colliders describe it exactly.
    const halfW = INNER_WIDTH / 2;
    const halfD = INNER_DEPTH / 2;
    this.opening = this.centre.clone().add(new Vector3(0, 0, halfD));
    this.colliders = [
      // Back wall.
      {
        kind: 'aabb',
        minX: this.centre.x - halfW - WALL,
        maxX: this.centre.x + halfW + WALL,
        minZ: this.centre.z - halfD - WALL,
        maxZ: this.centre.z - halfD,
      },
      // Left and right walls, stopping short of the opening.
      {
        kind: 'aabb',
        minX: this.centre.x - halfW - WALL,
        maxX: this.centre.x - halfW,
        minZ: this.centre.z - halfD,
        maxZ: this.centre.z + halfD,
      },
      {
        kind: 'aabb',
        minX: this.centre.x + halfW,
        maxX: this.centre.x + halfW + WALL,
        minZ: this.centre.z - halfD,
        maxZ: this.centre.z + halfD,
      },
    ];
  }

  /** Whether the interior light has been built; an unlit booth would read as a crate. */
  get lit(): boolean {
    return this.light !== null;
  }

  init(ctx: WorldContext): void {
    const shell = new MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.9 });
    const halfW = INNER_WIDTH / 2;
    const halfD = INNER_DEPTH / 2;

    const panels: readonly [number, number, number, number, number][] = [
      // x, z, width, depth, centreY
      [0, -halfD - WALL / 2, INNER_WIDTH + 2 * WALL, WALL, HEIGHT / 2],
      [-halfW - WALL / 2, 0, WALL, INNER_DEPTH, HEIGHT / 2],
      [halfW + WALL / 2, 0, WALL, INNER_DEPTH, HEIGHT / 2],
      // Roof.
      [0, 0, INNER_WIDTH + 2 * WALL, INNER_DEPTH + WALL, HEIGHT + WALL / 2],
    ];
    for (const [x, z, width, depth, centreY] of panels) {
      const height = centreY > HEIGHT ? WALL : HEIGHT;
      const mesh = new Mesh(new BoxGeometry(width, height, depth), shell);
      mesh.position.set(x, centreY, z);
      mesh.castShadow = ctx.quality.shadows;
      this.group.add(mesh);
    }

    // The booth's own lighting, which is half of what the product is.
    this.light = new PointLight(0xf2f6ff, 18, 16, 2);
    this.light.position.set(0, HEIGHT - 0.4, 0);
    this.group.add(this.light);

    this.plate = platePlate(this.options.accent);
    const plate = new Mesh(new PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), this.plate);
    plate.name = 'booth:plate';
    plate.position.set(halfW + WALL + 0.01, PLATE_Y, halfD - 0.6);
    plate.rotation.y = -Math.PI / 2;
    this.group.add(plate);

    ctx.scene.add(this.group);
  }

  update(): void {
    // The booth is a product, not a machine; nothing animates.
  }

  dispose(): void {
    this.plate?.map?.dispose();
    this.plate?.dispose();
    this.plate = null;
    this.light = null;
    disposeObject3D(this.group);
    this.group.clear();
  }
}

/** The model plate: name over a table of figures, the way a brochure prints it. */
function platePlate(accent: string): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: new Color(accent) });
  }

  context.fillStyle = '#e8eef6';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = accent;
  context.fillRect(0, 0, CANVAS_WIDTH, 12);

  context.fillStyle = '#16202a';
  context.font = 'bold 28px system-ui, sans-serif';
  context.textBaseline = 'top';
  context.fillText('NOVA VERTA Futura', 28, 36);

  context.font = '22px system-ui, sans-serif';
  BOOTH.specs.forEach(([label, value], index) => {
    const y = 96 + index * 46;
    context.fillStyle = '#5a6470';
    context.fillText(label, 28, y);
    context.fillStyle = '#16202a';
    context.fillText(value, 210, y);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: texture });
}

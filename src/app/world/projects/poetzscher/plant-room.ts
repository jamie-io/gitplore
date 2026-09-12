import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
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

/** The trades the company covers, one supply line each. */
export const SERVICES = ['Heizung', 'Lüftung', 'Sanitär', 'Elektro'] as const;

/** What the sign over the manifold says, quoting the site's own distinguishing property. */
export const NO_EXTERNAL_CONNECTIONS = 'Keine externen Verbindungen';

/** Half the plant wall's width, in metres. Every line terminates within it. */
export const ROOM_HALF_WIDTH = 3.2;

const WALL_HEIGHT = 3.2;
const WALL_DEPTH = 0.35;
const PIPE_RADIUS = 0.09;
const PIPE_TOP = 2.7;
/** How far down each line drops before its capped flange. */
const PIPE_DROP = 1.5;

const PLATE_WIDTH = 2.2;
const PLATE_HEIGHT = 0.5;
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 148;

const PIPE_COLOURS = [0xb04a3a, 0x4a7fb0, 0x3f8f6a, 0xd0a92f];

export interface PlantRoomOptions {
  /** Ground-level centre of the plant wall. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
  readonly accent: string;
}

/**
 * Pötzsch's plant wall: one supply line per trade, each ending in a capped flange inside the room.
 *
 * The site's distinguishing property is that it makes no external connections — local fonts, no
 * analytics, no cookie banner. Rendered as building services, that is a plant room whose lines all
 * terminate where you can see them, which is both what the company installs and what the
 * repository claims about itself.
 */
export class PlantRoom implements SceneObject {
  readonly id = 'poetzscher:plant';
  readonly colliders: readonly Collider[];
  /** Ground-level centre of the wall, in world space. */
  readonly centre: Vector3;
  /** Where each line stops. Nothing leaves the room, which is the whole point. */
  readonly pipeEnds: readonly Vector3[];

  private readonly group = new Group();
  private readonly options: PlantRoomOptions;
  private plate: MeshBasicMaterial | null = null;

  constructor(options: PlantRoomOptions) {
    this.options = options;
    this.centre = options.origin.clone();
    this.centre.y = options.ground.heightAt(this.centre.x, this.centre.z);

    this.group.name = this.id;
    this.group.position.copy(this.centre);
    this.group.rotation.y = options.rotationY;

    this.pipeEnds = SERVICES.map((_, index) => {
      const x = this.centre.x + this.offsetX(index);
      return new Vector3(x, this.centre.y + PIPE_TOP - PIPE_DROP, this.centre.z);
    });

    this.colliders = [
      {
        kind: 'aabb',
        minX: this.centre.x - ROOM_HALF_WIDTH,
        maxX: this.centre.x + ROOM_HALF_WIDTH,
        minZ: this.centre.z - WALL_DEPTH,
        maxZ: this.centre.z + WALL_DEPTH,
      },
    ];
  }

  private offsetX(index: number): number {
    const spacing = (ROOM_HALF_WIDTH * 2 - 1.2) / Math.max(SERVICES.length - 1, 1);
    return (index - (SERVICES.length - 1) / 2) * spacing;
  }

  init(ctx: WorldContext): void {
    const wall = new Mesh(
      new BoxGeometry(ROOM_HALF_WIDTH * 2, WALL_HEIGHT, WALL_DEPTH),
      new MeshStandardMaterial({ color: 0xd8dcd6, roughness: 0.95 }),
    );
    wall.position.set(0, WALL_HEIGHT / 2, 0);
    wall.receiveShadow = ctx.quality.shadows;
    this.group.add(wall);

    SERVICES.forEach((_, index) => {
      const colour = PIPE_COLOURS[index % PIPE_COLOURS.length];
      const material = new MeshStandardMaterial({ color: colour, roughness: 0.4, metalness: 0.3 });
      const pipe = new Mesh(new CylinderGeometry(PIPE_RADIUS, PIPE_RADIUS, PIPE_DROP, 8), material);
      pipe.position.set(
        this.offsetX(index),
        PIPE_TOP - PIPE_DROP / 2,
        WALL_DEPTH / 2 + PIPE_RADIUS,
      );
      pipe.castShadow = ctx.quality.shadows;
      this.group.add(pipe);

      // The capped flange: the line stops here rather than leaving the building.
      const cap = new Mesh(
        new CylinderGeometry(PIPE_RADIUS * 2, PIPE_RADIUS * 2, 0.08, 10),
        material,
      );
      cap.position.set(this.offsetX(index), PIPE_TOP - PIPE_DROP, WALL_DEPTH / 2 + PIPE_RADIUS);
      this.group.add(cap);
    });

    this.plate = signMaterial(this.options.accent);
    const plate = new Mesh(new PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), this.plate);
    plate.name = 'plant:sign';
    plate.position.set(0, WALL_HEIGHT - 0.45, WALL_DEPTH / 2 + 0.02);
    this.group.add(plate);

    ctx.scene.add(this.group);
  }

  update(): void {
    // Plant that is working correctly does not move visibly.
  }

  dispose(): void {
    this.plate?.map?.dispose();
    this.plate?.dispose();
    this.plate = null;
    disposeObject3D(this.group);
    this.group.clear();
  }
}

function signMaterial(accent: string): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: new Color(accent) });
  }

  context.fillStyle = '#eaf2ec';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = accent;
  context.fillRect(0, 0, 14, CANVAS_HEIGHT);

  context.fillStyle = '#16202a';
  context.font = 'bold 40px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(NO_EXTERNAL_CONNECTIONS, 40, CANVAS_HEIGHT / 2 - 18);

  context.fillStyle = '#5a6470';
  context.font = '24px system-ui, sans-serif';
  context.fillText(SERVICES.join(' · '), 40, CANVAS_HEIGHT / 2 + 30);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: texture });
}

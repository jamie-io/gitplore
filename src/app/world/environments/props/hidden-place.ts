import { BoxGeometry, Euler, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';

const INTERACT_RADIUS = 2.8;
const WIDTH = 2.8;
const DEPTH = 2.2;
const HEIGHT = 2.4;
const WALL = 0.22;

/** The nook's outer shell, so a host can cut room for it: walls included, the open front at +Z. */
export const HIDDEN_PLACE_SHELL = {
  width: WIDTH + WALL * 2,
  innerWidth: WIDTH,
  /** From the open front to the inner face of the back wall. */
  innerDepth: DEPTH,
  /** Local Z of the back wall's outer face. */
  back: -DEPTH / 2 - WALL,
  /** Height of the roof's upper face above the floor. */
  height: HEIGHT + WALL / 2,
} as const;

export interface HiddenPlaceOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly thing: Object3D;
  readonly onEnter?: () => void;
}

/** A small walk-in nook that hides a supplied, real object and carries no completion state. */
export class HiddenPlace implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly options: HiddenPlaceOptions;

  constructor(options: HiddenPlaceOptions) {
    this.options = options;
    this.id = options.id;
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    const rotationY = options.rotationY ?? 0;
    this.group.rotation.y = rotationY;
    this.colliders = [
      rotatedAabb(
        this.position,
        0,
        -DEPTH / 2 - WALL / 2,
        (WIDTH + WALL * 2) / 2,
        WALL / 2,
        rotationY,
      ),
      rotatedAabb(this.position, -WIDTH / 2 - WALL / 2, 0, WALL / 2, DEPTH / 2, rotationY),
      rotatedAabb(this.position, WIDTH / 2 + WALL / 2, 0, WALL / 2, DEPTH / 2, rotationY),
    ];
    this.interactables = [
      {
        id: `${this.id}:enter`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Versteck betreten',
        onInteract: () => this.options.onEnter?.(),
      },
    ];
  }

  init(ctx: WorldContext): void {
    const stone = new MeshStandardMaterial({ color: 0x47534c, roughness: 0.9 });
    const back = new Mesh(new BoxGeometry(WIDTH + WALL * 2, HEIGHT, WALL), stone);
    back.name = `${this.id}:back`;
    back.position.set(0, HEIGHT / 2, -DEPTH / 2 - WALL / 2);
    back.castShadow = ctx.quality.shadows;
    const left = new Mesh(new BoxGeometry(WALL, HEIGHT, DEPTH), stone);
    left.name = `${this.id}:left`;
    left.position.set(-WIDTH / 2 - WALL / 2, HEIGHT / 2, 0);
    left.castShadow = ctx.quality.shadows;
    const right = new Mesh(new BoxGeometry(WALL, HEIGHT, DEPTH), stone);
    right.name = `${this.id}:right`;
    right.position.set(WIDTH / 2 + WALL / 2, HEIGHT / 2, 0);
    right.castShadow = ctx.quality.shadows;
    const roof = new Mesh(new BoxGeometry(WIDTH + WALL * 2, WALL, DEPTH + WALL), stone);
    roof.name = `${this.id}:roof`;
    roof.position.y = HEIGHT;
    roof.castShadow = ctx.quality.shadows;

    const thing = this.options.thing;
    if (!thing.name) {
      thing.name = `${this.id}:thing`;
    }
    thing.position.set(0, 0.35, -0.25);
    this.group.add(back, left, right, roof, thing);
    ctx.scene.add(this.group);
  }

  update(): void {
    // Discovery is intentionally not a counter or a quest state.
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
  }
}

function rotatedAabb(
  origin: Vector3,
  centreX: number,
  centreZ: number,
  halfWidth: number,
  halfDepth: number,
  rotationY: number,
): Extract<Collider, { kind: 'aabb' }> {
  const rotation = new Euler(0, rotationY, 0);
  const corners = [-halfWidth, halfWidth].flatMap((x) =>
    [-halfDepth, halfDepth].map((z) =>
      new Vector3(centreX + x, 0, centreZ + z).applyEuler(rotation).add(origin),
    ),
  );

  return {
    kind: 'aabb',
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}

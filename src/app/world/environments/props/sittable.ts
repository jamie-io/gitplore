import { BoxGeometry, Euler, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { disposeObject3D } from '@engine/dispose';
import type { InputCapture } from '@engine/input.service';
import { Collider, HeightField } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';

const INTERACT_RADIUS = 2.8;
const HALF_WIDTH = 1.05;
const HALF_DEPTH = 0.42;
const SEAT_HEIGHT = 0.48;
const SEAT_OFFSET = HALF_DEPTH * 0.5;
const SEATED_EYE_HEIGHT = 1;
const SEATED_EYE_OFFSET = SEATED_EYE_HEIGHT - PLAYER_EYE_HEIGHT;

export interface SittableOptions {
  readonly id: string;
  readonly position: Vector3;
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly input: InputCapture;
  readonly onSit?: () => void;
  readonly onStand?: () => void;
}

/** A bench that moves the visitor onto its seat and captures walking controls. */
export class Sittable implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly options: SittableOptions;
  private readonly seat: Vector3;
  private player: PlayerController | null = null;
  private seatedValue = false;
  private readonly stopCapture: () => void;

  constructor(options: SittableOptions) {
    this.options = options;
    this.id = options.id;
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    const front = new Vector3(
      Math.sin(options.rotationY ?? 0),
      0,
      -Math.cos(options.rotationY ?? 0),
    );
    this.seat = this.position.clone().addScaledVector(front, SEAT_OFFSET);
    this.seat.y = options.ground.heightAt(this.seat.x, this.seat.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    const rotationY = options.rotationY ?? 0;
    this.group.rotation.y = rotationY;
    this.colliders = [
      {
        ...rotatedAabb(this.position, HALF_WIDTH, HALF_DEPTH, rotationY),
        top: this.position.y + SEAT_HEIGHT,
      },
    ];
    this.interactables = [
      {
        id: `${this.id}:sit`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Hinsetzen',
        onInteract: () => this.sit(),
      },
    ];
    this.stopCapture = options.input.addCaptureListener((captured) => {
      if (!captured && this.seatedValue) {
        this.stand();
      }
    });
  }

  get seated(): boolean {
    return this.seatedValue;
  }

  init(ctx: WorldContext): void {
    this.player = ctx.player;
    const wood = new MeshStandardMaterial({ color: 0x8a6040, roughness: 0.8 });
    const iron = new MeshStandardMaterial({ color: 0x303943, metalness: 0.3, roughness: 0.7 });

    const seat = new Mesh(new BoxGeometry(HALF_WIDTH * 2, 0.08, HALF_DEPTH * 2), wood);
    seat.name = `${this.id}:seat`;
    seat.position.y = SEAT_HEIGHT;
    seat.castShadow = ctx.quality.shadows;
    const back = new Mesh(new BoxGeometry(HALF_WIDTH * 2, 0.42, 0.08), wood);
    back.name = `${this.id}:back`;
    back.position.set(0, 0.73, HALF_DEPTH - 0.04);
    back.castShadow = ctx.quality.shadows;
    this.group.add(seat, back);
    for (const x of [-0.78, 0.78]) {
      const leg = new Mesh(new BoxGeometry(0.08, SEAT_HEIGHT, 0.32), iron);
      leg.position.set(x, SEAT_HEIGHT / 2, 0);
      leg.castShadow = ctx.quality.shadows;
      this.group.add(leg);
    }

    ctx.scene.add(this.group);
  }

  update(): void {
    // Sitting is a state change; the captured input service keeps the camera still between frames.
  }

  dispose(): void {
    if (this.seatedValue) {
      this.options.input.releaseCapture();
    }
    this.stand();
    this.stopCapture();
    this.player = null;
    disposeObject3D(this.group);
    this.group.clear();
  }

  private sit(): void {
    if (this.seatedValue) {
      return;
    }

    this.seatedValue = true;
    this.player?.setEyeHeightOffset(SEATED_EYE_OFFSET);
    this.player?.teleport(
      this.seat.clone().setY(this.seat.y + SEATED_EYE_HEIGHT),
      this.options.rotationY ?? 0,
    );
    this.options.input.capture('Aufstehen');
    this.options.onSit?.();
  }

  private stand(): void {
    if (!this.seatedValue) {
      return;
    }

    this.seatedValue = false;
    this.player?.setEyeHeightOffset(0);
    this.options.onStand?.();
  }
}

function rotatedAabb(
  origin: Vector3,
  halfWidth: number,
  halfDepth: number,
  rotationY: number,
): Extract<Collider, { kind: 'aabb' }> {
  const rotation = new Euler(0, rotationY, 0);
  const corners = [-halfWidth, halfWidth].flatMap((x) =>
    [-halfDepth, halfDepth].map((z) => new Vector3(x, 0, z).applyEuler(rotation).add(origin)),
  );

  return {
    kind: 'aabb',
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}

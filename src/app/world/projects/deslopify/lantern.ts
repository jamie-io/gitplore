import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  TorusGeometry,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import type { Collider } from '@engine/player/collision';
import type { WorldContext } from '@engine/world-object';
import type { SceneObject } from '../../project/project.scene';

const POST_RADIUS = 0.14;
const POST_LIGHT_RADIUS = 2.5;
const CARRIED_LIGHT_RADIUS = 5.5;
const IGNITION_SECONDS = 0.7;
const CARRY_DELAY_SECONDS = 0.9;
const CARRY_RATE = 2.2;
const EXTINGUISH_SECONDS = 0.4;

type LanternState = 'unlit' | 'lit' | 'carried' | 'out';
type LightTransition = 'on' | 'off' | null;

export interface LanternOptions {
  /** Ground-level foot of the post. */
  readonly position: Vector3;
  /** Rotation of the post and arm around the ground Y axis. */
  readonly rotationY: number;
  /** Reduced motion removes ignition, carry, and extinguish easing. */
  readonly reducedMotion?: () => boolean;
}

/** A movable amber lantern that starts on a hook and can follow the explorer's hand. */
export class Lantern implements SceneObject {
  readonly id = 'deslopify:lantern';
  readonly colliders: readonly Collider[];

  private readonly group = new Group();
  private readonly body = new Group();
  private readonly position: Vector3;
  private readonly rotationY: number;
  private readonly reducedMotion: () => boolean;
  private readonly carryStart = new Vector3();

  private state: LanternState = 'unlit';
  private transition: LightTransition = null;
  private transitionElapsed = 0;
  private ignitionElapsed = 0;
  private carryElapsed = 0;
  private glowValue = 0;
  private socket: Object3D | null = null;
  private lightSocket: Object3D | null = null;
  private glass: MeshStandardMaterial | null = null;
  private light: PointLight | null = null;
  private initialized = false;

  constructor(options: LanternOptions) {
    this.position = options.position.clone();
    this.rotationY = options.rotationY;
    this.reducedMotion = options.reducedMotion ?? (() => false);

    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
    this.body.name = 'lantern-body';
    this.body.position.set(-0.42, 1.5, 0);

    this.colliders = [
      {
        kind: 'cylinder',
        x: this.position.x,
        z: this.position.z,
        radius: POST_RADIUS,
      },
    ];
  }

  get glow(): number {
    return this.glowValue;
  }

  get lightRadius(): number {
    // An unlit lantern clears nothing; on its hook it lights a small pool, in the hand the trail.
    return (
      (this.state === 'carried' || this.state === 'out'
        ? CARRIED_LIGHT_RADIUS
        : POST_LIGHT_RADIUS) * this.glowValue
    );
  }

  /** Current body origin in world coordinates. */
  worldPosition(target: Vector3): Vector3 {
    return this.body.getWorldPosition(target);
  }

  init(ctx: WorldContext): void {
    if (this.initialized) {
      return;
    }

    const postMaterial = new MeshStandardMaterial({ color: 0x4a3120, roughness: 0.9 });
    const metal = new MeshStandardMaterial({
      color: 0x2c2a22,
      roughness: 0.4,
      metalness: 0.7,
    });
    this.glass = new MeshStandardMaterial({
      color: 0x2a2010,
      emissive: 0xffa640,
      emissiveIntensity: 0,
      roughness: 0.2,
      transparent: true,
      opacity: 0.95,
    });

    const post = new Mesh(new CylinderGeometry(0.07, 0.09, 2.1, 8), postMaterial);
    post.name = 'lantern-post';
    post.position.y = 1.05;
    post.castShadow = ctx.quality.shadows;

    const arm = new Mesh(new BoxGeometry(0.5, 0.05, 0.05), metal);
    arm.name = 'lantern-arm';
    arm.position.set(-0.22, 2.02, 0);
    arm.castShadow = ctx.quality.shadows;

    const base = new Mesh(new CylinderGeometry(0.12, 0.14, 0.05, 12), metal);
    base.name = 'lantern-base';

    const roof = new Mesh(new ConeGeometry(0.15, 0.14, 12), metal);
    roof.name = 'lantern-roof';
    roof.position.y = 0.33;

    const ring = new Mesh(new TorusGeometry(0.05, 0.012, 6, 12), metal);
    ring.name = 'lantern-ring';
    ring.position.y = 0.44;

    const glass = new Mesh(new CylinderGeometry(0.1, 0.1, 0.24, 12), this.glass);
    glass.name = 'lantern-glass';
    glass.position.y = 0.15;

    this.body.add(base, roof, ring, glass);
    for (let index = 0; index < 4; index++) {
      const bar = new Mesh(new BoxGeometry(0.018, 0.26, 0.018), metal);
      bar.name = 'lantern-bar';
      bar.position.set(
        Math.cos(index * (Math.PI / 2)) * 0.11,
        0.15,
        Math.sin(index * (Math.PI / 2)) * 0.11,
      );
      this.body.add(bar);
    }

    this.light = new PointLight(0xffb45a, 0, 11, 1.6);
    this.light.name = 'lantern-light';
    this.light.position.y = 0.16;
    this.body.add(this.light);

    this.group.add(post, arm, this.body);
    this.initialized = true;
    this.applyGlow();
    ctx.scene.add(this.group);
    this.attachLight();
  }

  update(dt: number): void {
    if (!this.initialized || dt < 0) {
      return;
    }

    const reduced = this.reducedMotion();
    if (this.state === 'lit') {
      this.igniteStep(dt, reduced);
      if (reduced || this.ignitionElapsed >= CARRY_DELAY_SECONDS) {
        this.beginCarry(reduced);
      }
    } else if (this.state === 'carried' || this.state === 'out') {
      this.transitionStep(dt, reduced);
    }

    if (this.state === 'carried' && this.carryElapsed < 1) {
      this.carryStep(dt, reduced);
    }
    this.applyGlow();
  }

  ignite(): void {
    if (this.state !== 'unlit') {
      return;
    }
    this.state = 'lit';
    this.transition = null;
    this.ignitionElapsed = 0;
    this.glowValue = 0;
    this.applyGlow();
  }

  toggle(): void {
    if (this.state === 'carried') {
      this.state = 'out';
      this.transition = 'off';
      this.transitionElapsed = 0;
      return;
    }
    if (this.state === 'out') {
      this.state = 'carried';
      this.transition = 'on';
      this.transitionElapsed = 0;
    }
  }

  /** Supplies holder socket. If lantern already travels, reparent while preserving world pose. */
  attachTo(socket: Object3D, lightSocket?: Object3D): void {
    this.socket = socket;
    this.lightSocket = lightSocket ?? null;
    if (this.state === 'carried' || this.state === 'out') {
      this.attachBody();
      this.attachLight();
    }
  }

  reset(): void {
    this.state = 'unlit';
    this.transition = null;
    this.transitionElapsed = 0;
    this.ignitionElapsed = 0;
    this.carryElapsed = 0;
    this.glowValue = 0;
    if (this.initialized) {
      this.group.updateMatrixWorld(true);
      this.body.updateMatrixWorld(true);
      if (this.body.parent !== this.group) {
        this.group.attach(this.body);
      }
      this.body.position.set(-0.42, 1.5, 0);
      this.body.updateMatrixWorld(true);
      if (this.light && this.light.parent !== this.body) {
        this.body.attach(this.light);
      }
      this.light?.position.set(0, 0.16, 0);
    }
    this.applyGlow();
  }

  dispose(): void {
    if (this.body.parent !== this.group) {
      this.body.removeFromParent();
      disposeObject3D(this.body);
    }
    disposeObject3D(this.group);
    this.group.clear();
    this.body.clear();
    this.light = null;
    this.glass = null;
    this.socket = null;
    this.lightSocket = null;
    this.initialized = false;
  }

  private igniteStep(dt: number, reduced: boolean): void {
    this.ignitionElapsed += dt;
    this.glowValue = reduced ? 1 : Math.min(1, this.ignitionElapsed / IGNITION_SECONDS);
  }

  private beginCarry(reduced: boolean): void {
    this.state = 'carried';
    this.carryElapsed = 0;
    this.attachBody();
    this.attachLight();
    if (reduced) {
      this.carryElapsed = 1;
      this.body.position.copy(HANG);
    }
  }

  private attachBody(): void {
    if (!this.socket || !this.initialized || this.body.parent === this.socket) {
      return;
    }
    this.group.updateMatrixWorld(true);
    this.socket.updateMatrixWorld(true);
    this.socket.attach(this.body);
    this.carryStart.copy(this.body.position);
    this.carryElapsed = 0;
  }

  private attachLight(): void {
    if (
      !this.lightSocket ||
      !this.light ||
      !this.initialized ||
      this.light.parent === this.lightSocket
    ) {
      return;
    }
    this.group.updateMatrixWorld(true);
    this.lightSocket.updateMatrixWorld(true);
    this.lightSocket.attach(this.light);
  }

  private carryStep(dt: number, reduced: boolean): void {
    if (reduced) {
      this.carryElapsed = 1;
      this.body.position.copy(HANG);
      return;
    }
    this.carryElapsed = Math.min(1, this.carryElapsed + dt * CARRY_RATE);
    const eased = 1 - Math.pow(1 - this.carryElapsed, 3);
    this.body.position.lerpVectors(this.carryStart, HANG, eased);
  }

  private transitionStep(dt: number, reduced: boolean): void {
    if (!this.transition) {
      this.glowValue = this.state === 'carried' ? 1 : 0;
      return;
    }

    this.transitionElapsed += dt;
    if (this.transition === 'on') {
      this.glowValue = reduced ? 1 : Math.min(1, this.transitionElapsed / IGNITION_SECONDS);
      if (reduced || this.transitionElapsed >= IGNITION_SECONDS) {
        this.transition = null;
        this.glowValue = 1;
      }
    } else {
      this.glowValue = reduced ? 0 : Math.max(0, 1 - this.transitionElapsed / EXTINGUISH_SECONDS);
      if (reduced || this.transitionElapsed >= EXTINGUISH_SECONDS) {
        this.transition = null;
        this.glowValue = 0;
      }
    }
  }

  private applyGlow(): void {
    if (this.glass) {
      this.glass.emissiveIntensity = this.glowValue * 3.2;
    }
    if (this.light) {
      this.light.intensity = this.glowValue * 7;
    }
  }
}

/** Where the lantern hangs from the hand: its ring just below the fist, the body below that. */
const HANG = new Vector3(0, -0.46, 0);

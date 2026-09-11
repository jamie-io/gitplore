import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Collider } from '@engine/player/collision';
import { WorldContext } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';
import { Anchor, Environment } from './environment';
import { ProceduralGround } from './ground';
import { clearOf, Position } from './placement';
import type { EnvironmentOptions } from './create-environment';

const SIZE = 160;
const TRUNK_RADIUS = 0.55;
const TREE_COUNT = 54;
/** No trees inside this radius, so the arrival point stays open and walkable. */
const GLADE_RADIUS = 11;
const TREE_MAX_RADIUS = 62;
/** Where exhibits stand: far enough to walk to, near enough to spot through the fog. */
const EXHIBIT_RADIUS = 19;
/** The arc exhibits are spread over, in radians, centred on the direction the player faces. */
const EXHIBIT_ARC = Math.PI * 0.9;

const CANOPY = 0x2f5d34;
const FOG = 0x28402c;

/** Gentle, non-repeating relief; shallow enough that nothing is ever hidden behind a hill. */
export function jungleHeightAt(x: number, z: number): number {
  return 1.4 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.55 * Math.sin((x - z) * 0.21);
}

/**
 * Deterministic pseudo-random numbers. The world is rebuilt every time the visitor returns, so a
 * tree that moved between visits would read as a bug — the same reasoning as `ringPlacements`.
 */
function* noise(seed: number): Generator<number> {
  let state = seed;
  for (;;) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    yield state / 4294967296;
  }
}

/** Dense, close, humid: the world behind a portal that should feel like undergrowth. */
export class JungleEnvironment implements Environment {
  readonly id = 'jungle' as const;
  readonly name = 'Dschungel';
  readonly spawn = new Vector3(0, jungleHeightAt(0, 0), 0);
  readonly spawnYaw = 0;
  readonly colliders: readonly Collider[];

  private readonly floor = new ProceduralGround({
    id: 'jungle-floor',
    size: SIZE,
    color: 0x32462c,
    segments: 120,
    heightAt: jungleHeightAt,
  });
  private readonly trees: readonly { x: number; z: number; height: number }[];
  private readonly added: Object3D[] = [];
  private scene: WorldContext['scene'] | null = null;

  constructor(options: EnvironmentOptions) {
    void options;
    const random = noise(20260911);
    this.trees = Array.from({ length: TREE_COUNT }, () => {
      const angle = random.next().value * Math.PI * 2;
      const radius = GLADE_RADIUS + random.next().value * (TREE_MAX_RADIUS - GLADE_RADIUS);
      return {
        x: Math.sin(angle) * radius,
        z: Math.cos(angle) * radius,
        height: 6 + random.next().value * 5,
      };
    });
    this.colliders = this.trees.map((tree) => ({
      kind: 'cylinder' as const,
      x: tree.x,
      z: tree.z,
      radius: TRUNK_RADIUS + 0.25,
    }));
  }

  get ground() {
    return this.floor;
  }

  /** An arc in front of the arrival point, each exhibit turned back towards it. */
  anchors(count: number, avoid: readonly Position[] = []): readonly Anchor[] {
    const slots = count + avoid.length;
    const candidates: Anchor[] = Array.from({ length: slots }, (_, index) => {
      const t = slots === 1 ? 0.5 : index / (slots - 1);
      // spawnYaw looks down −Z, so the arc is centred on −Z: angle 0 is straight ahead.
      const angle = (t - 0.5) * EXHIBIT_ARC;
      const x = Math.sin(angle) * EXHIBIT_RADIUS;
      const z = -Math.cos(angle) * EXHIBIT_RADIUS;
      // Front direction is (sin r, cos r); facing the arrival point means pointing at the origin.
      return { position: [x, 0, z] as const, rotationY: Math.atan2(-x, -z) + Math.PI };
    });

    return clearOf(candidates, avoid, count);
  }

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    ctx.scene.background = new Color(FOG);
    ctx.scene.fog = new Fog(FOG, 6, Math.min(ctx.quality.fogFar, 75));

    this.floor.init(ctx);

    const bark = new MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true });
    const leaves = new MeshStandardMaterial({ color: CANOPY, roughness: 1, flatShading: true });
    const trunkGeometry = new CylinderGeometry(TRUNK_RADIUS * 0.8, TRUNK_RADIUS, 1, 6);
    const canopyGeometry = new ConeGeometry(2.6, 3.4, 7);

    for (const tree of this.trees) {
      const group = new Group();
      group.name = 'tree';
      const trunk = new Mesh(trunkGeometry, bark);
      trunk.scale.y = tree.height;
      trunk.position.y = tree.height / 2;
      trunk.castShadow = ctx.quality.shadows;
      group.add(trunk);

      for (const [lift, scale] of [
        [0.78, 1],
        [1, 0.7],
      ] as const) {
        const canopy = new Mesh(canopyGeometry, leaves);
        canopy.position.y = tree.height * lift;
        canopy.scale.setScalar(scale);
        canopy.castShadow = ctx.quality.shadows;
        group.add(canopy);
      }

      group.position.set(tree.x, jungleHeightAt(tree.x, tree.z), tree.z);
      this.added.push(group);
    }

    const ambient = new HemisphereLight(0x8fbf7a, 0x1c2a1a, 1.1);
    const shaft = new DirectionalLight(0xd8f0b0, 1.1);
    shaft.position.set(-20, 40, -12);
    shaft.castShadow = ctx.quality.shadows;
    this.added.push(ambient, shaft);

    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(): void {
    // Still air: the canopy does not sway, and a swaying one would fight `prefers-reduced-motion`.
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.floor.dispose();
    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
      this.scene = null;
    }
  }
}

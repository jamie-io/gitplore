import {
  CatmullRomCurve3,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { between, seededRandom } from '../../environments/random';

const VINE_POINTS = 7;
const TUBE_SEGMENTS = 40;
const TUBE_RADIAL_SEGMENTS = 6;
const MIN_GROW = 0.06;
const RETREAT_RATE = 2.6;
const REGROW_RATE = 0.3;
const BUD_RADIUS = 0.07;

export interface SlopVinesOptions {
  readonly anchors: readonly Vector3[];
  readonly seed: number;
  readonly reducedMotion?: boolean | (() => boolean);
}

interface VineState {
  readonly anchor: Vector3;
  readonly group: Group;
  readonly endpoint: Vector3;
  readonly phase: number;
  grow: number;
}

/** Procedural slop vines hanging from world-space canopy anchors. */
export class SlopVines {
  readonly object = new Group();

  private readonly anchors: readonly Vector3[];
  private readonly vines: VineState[] = [];
  private readonly tubeMaterial = new MeshStandardMaterial({
    color: 0x9a3f8d,
    roughness: 0.45,
    emissive: 0x5a1a58,
    emissiveIntensity: 0.4,
  });
  private readonly budMaterial = new MeshStandardMaterial({
    color: 0x1a0418,
    emissive: 0xff5ae6,
    emissiveIntensity: 2.4,
  });
  private readonly buds: InstancedMesh;
  private readonly budHelper = new Object3D();
  private readonly budPosition = new Vector3();
  private readonly budGeometry = new SphereGeometry(BUD_RADIUS, 10, 8);
  private readonly reducedMotion: () => boolean;
  private time = 0;

  constructor(options: SlopVinesOptions) {
    this.anchors = options.anchors.map((anchor) => anchor.clone());
    this.reducedMotion = motionFlag(options.reducedMotion);
    this.object.name = 'slop-vines';
    this.object.userData['vineCount'] = this.anchors.length;

    const random = seededRandom(options.seed);
    this.anchors.forEach((anchor, index) => {
      const length = between(random, 3.6, 5);
      const points = Array.from({ length: VINE_POINTS }, (_, pointIndex) => {
        const progress = pointIndex / (VINE_POINTS - 1);
        const curl = progress * progress;
        return new Vector3(
          Math.sin(progress * 5 + index) * 0.18 * progress +
            Math.sin(progress * 2.4 + index) * 0.04 * curl,
          -progress * length,
          Math.cos(progress * 4 + index) * 0.14 * progress +
            Math.sin(progress * 3 + index) * 0.03 * curl,
        );
      });
      const radius = between(random, 0.03, 0.055);
      const tube = new Mesh(
        new TubeGeometry(
          new CatmullRomCurve3(points),
          TUBE_SEGMENTS,
          radius,
          TUBE_RADIAL_SEGMENTS,
          false,
        ),
        this.tubeMaterial,
      );
      tube.name = `slop-vine:${index}`;
      tube.castShadow = true;
      tube.userData['pointCount'] = VINE_POINTS;
      tube.userData['length'] = length;
      tube.userData['radius'] = radius;

      const group = new Group();
      group.name = `slop-vine:${index}`;
      group.position.copy(anchor);
      group.add(tube);
      group.userData['grow'] = 1;
      group.userData['anchor'] = anchor.clone();
      this.object.add(group);
      this.vines.push({
        anchor,
        group,
        endpoint: points[points.length - 1]!.clone(),
        phase: between(random, 0, Math.PI * 2),
        grow: 1,
      });
    });

    this.buds = new InstancedMesh(this.budGeometry, this.budMaterial, this.vines.length);
    this.buds.name = 'slop-vine-buds';
    this.buds.castShadow = true;
    this.buds.userData['radius'] = BUD_RADIUS;
    this.object.add(this.buds);
    this.applyVisuals();
  }

  update(dt: number, isCleared: (index: number, anchor: Vector3) => boolean): void {
    const seconds = Math.max(0, dt);
    this.time += seconds;
    for (let index = 0; index < this.vines.length; index++) {
      const vine = this.vines[index]!;
      const cleared = isCleared(index, vine.anchor);
      vine.grow = this.reducedMotion()
        ? cleared
          ? MIN_GROW
          : 1
        : clamp(vine.grow + (cleared ? -RETREAT_RATE : REGROW_RATE) * seconds, MIN_GROW, 1);
      vine.group.userData['grow'] = vine.grow;
    }
    this.applyVisuals();
  }

  /** Restore one vine to full height. */
  grow(index: number): void {
    const vine = this.vines[index];
    if (!vine) return;
    vine.grow = 1;
    vine.group.userData['grow'] = 1;
    this.applyVisuals();
  }

  /** Restore every vine to its full slop state. */
  reset(): void {
    for (const vine of this.vines) {
      vine.grow = 1;
      vine.group.userData['grow'] = 1;
    }
    this.time = 0;
    this.applyVisuals();
  }

  dispose(): void {
    disposeObject3D(this.object);
    this.object.clear();
  }

  private applyVisuals(): void {
    let totalGrow = 0;
    for (let index = 0; index < this.vines.length; index++) {
      const vine = this.vines[index]!;
      const scale = vine.grow;
      totalGrow += scale;
      vine.group.scale.set(1, scale, 1);
      if (this.reducedMotion()) {
        vine.group.rotation.set(0, 0, 0);
      } else {
        vine.group.rotation.x = (1 - scale) * 0.4;
        vine.group.rotation.z = Math.sin(this.time * 0.8 + vine.phase) * 0.05 * scale;
      }

      this.budPosition.set(vine.endpoint.x, vine.endpoint.y * scale, vine.endpoint.z);
      this.budPosition.applyEuler(vine.group.rotation);
      this.budHelper.position.copy(vine.anchor).add(this.budPosition);
      this.budHelper.scale.setScalar(1);
      this.budHelper.rotation.set(0, 0, 0);
      this.budHelper.updateMatrix();
      this.buds.setMatrixAt(index, this.budHelper.matrix);
    }
    this.buds.instanceMatrix.needsUpdate = true;
    this.budMaterial.emissiveIntensity =
      this.vines.length > 0 ? (totalGrow / this.vines.length) * 2.4 : 2.4;
    this.buds.userData['emissiveIntensity'] = this.budMaterial.emissiveIntensity;
  }
}

function motionFlag(value: boolean | (() => boolean) | undefined): () => boolean {
  return typeof value === 'function' ? value : () => value === true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

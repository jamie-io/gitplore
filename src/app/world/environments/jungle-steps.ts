import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { assemble, paint } from './flora';
import { WOOD_TONES } from './jungle-bridge';
import {
  ARCH,
  BOARDWALK,
  DECK,
  Pt,
  STEPS,
  jungleHeightAt,
  nearestOnPath,
  pathLength,
  pointAlong,
  stepCentres,
} from './jungle-layout';
import { seededRandom } from './random';
import { withAtmosphere } from './shaders/atmosphere';
import { HazedCopies } from './shaders/hazed-copies';
import { SharedUniforms } from './shaders/shared-uniforms';

/**
 * The commit steps, modelled in Blender (scripts/blender/models/commit_steps.py): one module per
 * step, `step_00` … `step_10`, each with an inset strip in the `inlay` material that glows when
 * the step's period had commits. Its origin is the flight's foot, level with the boardwalk, and
 * the flight runs along its −Z.
 */
export const COMMIT_STEPS_MODEL = 'assets/models/commit-steps.glb';
export const STEP_INLAY_MATERIAL = 'inlay';

/** The name of step `index`'s node in the model. */
export function stepNode(index: number): string {
  return `step_${String(index).padStart(2, '0')}`;
}

/** Metres across the boardwalk's planks, and across the steps. */
export const BOARDWALK_WIDTH = 1.6;
export const STEP_WIDTH = 1.4;

/** The inlay's glow: dark in a period without commits, amber over the tone mapper's white in one with. */
const INLAY = { dark: 0x3a2a14, lit: 0xe0a13c, litGain: 2.4 } as const;
/** The model's inlay emissive intensity, off and on. */
const INLAY_EMISSIVE = { dark: 0.12, lit: 2.4 } as const;

/** A plank across the walk: its thickness, its width along the walk and the pitch between two. */
const PLANK = { thickness: 0.07, width: 0.27, pitch: 0.32 } as const;
/** Metres between the boardwalk's colliders along its line; each is a disc as wide as the planks. */
const WALK_PITCH = 0.5;
/**
 * Each step is a row of small discs across its tread, each with the step's walkable top: only just
 * deeper than the tread along the flight, so the floor steps up where the tread does, and close
 * enough across that the row leaves no gap to fall through.
 */
const STEP_DISC = { radius: 0.28, across: [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55] } as const;
const RAIL = { height: 0.9, inset: 0.08 } as const;

/** The flight's direction on the ground, unit length, and its length. */
const FLIGHT = (() => {
  const dx = STEPS.to.x - STEPS.from.x;
  const dz = STEPS.to.z - STEPS.from.z;
  const length = Math.hypot(dx, dz);
  return { x: dx / length, z: dz / length, length };
})();
/** A box's `rotateY` that lays its local Z along the flight. */
const FLIGHT_TURN = Math.atan2(FLIGHT.x, FLIGHT.z);

/** Metres along the boardwalk from the portal, from where its planks run over the marsh. */
const BOARDWALK_START = (() => {
  const length = pathLength(BOARDWALK);
  for (let along = 0; along < length; along += 0.1) {
    const at = pointAlong(BOARDWALK, along);
    if (jungleHeightAt(at.x, at.z) < STEPS.bottom) {
      return Math.max(0, along - 0.4);
    }
  }
  return length;
})();

/** The landing between the top step and the deck's south end, level with the deck. */
const LANDING = {
  minX: ARCH.x - 0.9,
  maxX: ARCH.x + 0.9,
  minZ: ARCH.z + DECK.halfLength - 0.1,
  maxZ: STEPS.to.z + 0.4,
} as const;

/**
 * The colliders the boardwalk, the steps and the landing stand on: every one a walkable top, and
 * from the marsh below a wall, so the visitor climbs on only where the ground meets the planks.
 */
function walkColliders(): Collider[] {
  const colliders: Collider[] = [];
  const length = pathLength(BOARDWALK);
  for (let along = BOARDWALK_START; along <= length + 1e-9; along += WALK_PITCH) {
    const at = pointAlong(BOARDWALK, Math.min(along, length));
    colliders.push({
      kind: 'cylinder',
      x: at.x,
      z: at.z,
      radius: BOARDWALK_WIDTH / 2,
      top: STEPS.bottom,
    });
  }
  // Across the flight: its right hand, with forward along the flight.
  const across = { x: -FLIGHT.z, z: FLIGHT.x };
  for (const centre of stepCentres()) {
    for (const offset of STEP_DISC.across) {
      colliders.push({
        kind: 'cylinder',
        x: centre.x + across.x * offset,
        z: centre.z + across.z * offset,
        radius: STEP_DISC.radius,
        top: centre.y,
      });
    }
  }
  colliders.push({ kind: 'aabb', ...LANDING, top: DECK.height });
  return colliders;
}

export interface JungleStepsOptions {
  readonly shared: SharedUniforms;
}

/**
 * The walk from the ledge to the arch: the boardwalk over the marsh at 0.8 m, then the eleven
 * commit steps up to the deck, 2.4 m up, one per period of the project's history, with rope rails.
 * The steps whose period had commits light their inlay (`setLit`, driven by the flow). Everything
 * the visitor walks on is a collider with a walkable top.
 *
 * The steps are Blender-authored when `commit-steps.glb` is there; until it arrives, and for good
 * if it never does, a procedural flight in the boardwalk's timber stands in.
 */
export class JungleSteps implements WorldObject {
  readonly id = 'commit-steps';
  readonly colliders: readonly Collider[] = walkColliders();

  private boardwalk: Mesh | null = null;
  private flight: Mesh | null = null;
  private inlay: InstancedMesh<BoxGeometry, MeshBasicMaterial> | null = null;
  private model: Group | null = null;
  private haze: HazedCopies | null = null;
  /** Each step's own copy of the model's inlay, so each lights on its own. */
  private inlays: (MeshStandardMaterial | null)[] = [];
  private readonly lit: boolean[] = Array.from({ length: STEPS.count }, () => false);
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;

  constructor(private readonly options: JungleStepsOptions) {}

  init(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    const shadows = ctx.quality.shadows;
    const timber = () =>
      withAtmosphere(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
        this.options.shared,
      );

    this.boardwalk = new Mesh(boardwalkGeometry(), timber());
    this.boardwalk.name = 'boardwalk';
    this.boardwalk.castShadow = shadows;
    this.boardwalk.receiveShadow = shadows;
    ctx.scene.add(this.boardwalk);

    this.flight = new Mesh(flightGeometry(), timber());
    this.flight.name = 'commit-steps';
    this.flight.castShadow = shadows;
    this.flight.receiveShadow = shadows;
    ctx.scene.add(this.flight);

    this.inlay = inlayStrips();
    this.paintInlay();
    ctx.scene.add(this.inlay);

    // A missing model is no error worth showing: the procedural flight simply stays.
    ctx.assets.model(COMMIT_STEPS_MODEL).then(
      (model) => this.placeModel(ctx, model),
      () => undefined,
    );
  }

  update(): void {
    // Timber and rope: nothing moves; the inlays change only when the flow says so.
  }

  /** Whether step `index`'s inlay glows. */
  isLit(index: number): boolean {
    return this.lit[index] ?? false;
  }

  /** Lights step `index`'s inlay if its period had commits, or darkens it. */
  setLit(index: number, commits: boolean): void {
    if (index < 0 || index >= STEPS.count || this.lit[index] === commits) {
      return;
    }
    this.lit[index] = commits;
    this.paintInlay();
    const material = this.inlays[index];
    if (material) {
      material.emissiveIntensity = commits ? INLAY_EMISSIVE.lit : INLAY_EMISSIVE.dark;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const mesh of [this.boardwalk, this.flight, this.inlay]) {
      if (mesh) {
        disposeObject3D(mesh);
      }
    }
    this.boardwalk = null;
    this.flight = null;
    this.inlay = null;
    if (this.model) {
      // The asset service owns the model's geometry and materials; hand the copy back instead.
      this.model.removeFromParent();
      this.model = null;
      this.assets?.releaseModel(COMMIT_STEPS_MODEL);
    }
    for (const material of this.inlays) {
      material?.dispose();
    }
    this.inlays = [];
    this.haze?.dispose();
    this.haze = null;
  }

  private paintInlay(): void {
    if (!this.inlay) {
      return;
    }
    const colour = new Color();
    for (let i = 0; i < STEPS.count; i++) {
      if (this.lit[i]) {
        colour.set(INLAY.lit).multiplyScalar(INLAY.litGain);
      } else {
        colour.set(INLAY.dark);
      }
      this.inlay.setColorAt(i, colour);
    }
    if (this.inlay.instanceColor) {
      this.inlay.instanceColor.needsUpdate = true;
    }
  }

  private placeModel(ctx: WorldContext, model: Group): void {
    if (this.disposed) {
      // Too late: hand the copy straight back.
      ctx.assets.releaseModel(COMMIT_STEPS_MODEL);
      return;
    }
    const haze = (this.haze = new HazedCopies(this.options.shared));
    const inlays: (MeshStandardMaterial | null)[] = Array.from({ length: STEPS.count }, () => null);
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
        object.receiveShadow = ctx.quality.shadows;
        const index = stepOf(object);
        const wear = (material: Material) =>
          index === null ? haze.of(material) : this.stepMaterial(material, index, inlays);
        object.material = Array.isArray(object.material)
          ? object.material.map(wear)
          : wear(object.material as Material);
      }
    });
    this.inlays = inlays;
    inlays.forEach((material, index) => {
      if (material) {
        material.emissiveIntensity = this.lit[index] ? INLAY_EMISSIVE.lit : INLAY_EMISSIVE.dark;
      }
    });

    model.name = 'commit-steps-model';
    model.position.set(STEPS.from.x, STEPS.bottom, STEPS.from.z);
    // The model's flight runs along its −Z.
    model.rotation.y = Math.atan2(-FLIGHT.x, -FLIGHT.z);
    this.model = model;
    ctx.scene.add(model);
    for (const mesh of [this.flight, this.inlay]) {
      if (mesh) {
        disposeObject3D(mesh);
      }
    }
    this.flight = null;
    this.inlay = null;
  }

  /** A step's material: its own lit copy of the inlay, or the shared hazed copy of anything else. */
  private stepMaterial(
    material: Material,
    index: number,
    inlays: (MeshStandardMaterial | null)[],
  ): Material {
    if (material.name === STEP_INLAY_MATERIAL && material instanceof MeshStandardMaterial) {
      const own = inlays[index] ?? this.haze!.own(material.clone());
      own.emissive.set(INLAY.lit);
      inlays[index] = own;
      return own;
    }
    return this.haze!.of(material);
  }
}

/** Which step a model's mesh belongs to: the index of the `step_NN` node it hangs under, if any. */
function stepOf(object: Object3D): number | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const match = /^step_(\d\d)$/.exec(node.name);
    if (match) {
      const index = Number(match[1]);
      return index < STEPS.count ? index : null;
    }
  }
  return null;
}

/** A box `size` big (x across, y up, z along) laid at `at` and turned by `turn` about Y. */
function box(
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  colour: number,
  turn = 0,
): BufferGeometry {
  return paint(new BoxGeometry(...size).rotateY(turn).translate(at[0], at[1], at[2]), colour);
}

/** A post of `radius` from `bottom` to `top` at (x, z). */
function post(
  x: number,
  z: number,
  bottom: number,
  top: number,
  radius: number,
  colour: number,
): BufferGeometry {
  return paint(
    new CylinderGeometry(radius * 0.85, radius, Math.max(top - bottom, 0.01), 6).translate(
      x,
      (top + bottom) / 2,
      z,
    ),
    colour,
  );
}

/** A beam from `a` to `b` (world points with heights), `size` thick across and up. */
export function beam(
  a: Pt & { readonly y: number },
  b: Pt & { readonly y: number },
  size: readonly [number, number],
  colour: number,
): BufferGeometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const flat = Math.hypot(dx, dz);
  const geometry = new BoxGeometry(size[0], size[1], Math.hypot(flat, dy));
  // Tilt its +Z end up by the rise (a positive turn about X would tip it down), then aim it.
  geometry.rotateX(-Math.atan2(dy, flat));
  geometry.rotateY(Math.atan2(dx, dz));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(geometry, colour);
}

/**
 * The boardwalk's planks from where the ramp meets them to the foot of the steps, on two stringers
 * and posts down to the marsh, and the landing between the top step and the deck: one geometry.
 */
function boardwalkGeometry(): BufferGeometry {
  const random = seededRandom(93);
  const parts: BufferGeometry[] = [];
  const length = pathLength(BOARDWALK);
  let plank = 0;
  for (let along = BOARDWALK_START; along <= length; along += PLANK.pitch) {
    const at = pointAlong(BOARDWALK, along);
    const ahead = pointAlong(BOARDWALK, Math.min(along + 0.3, length));
    const behind = pointAlong(BOARDWALK, Math.max(along - 0.3, 0));
    const turn = Math.atan2(ahead.x - behind.x, ahead.z - behind.z) + (random() - 0.5) * 0.04;
    const lift = (random() - 0.5) * 0.02;
    parts.push(
      box(
        [BOARDWALK_WIDTH, PLANK.thickness, PLANK.width],
        [at.x, STEPS.bottom - PLANK.thickness / 2 + lift, at.z],
        WOOD_TONES[plank++ % WOOD_TONES.length],
        turn,
      ),
    );
  }

  // Stringers and posts along each leg of the walk that runs over the marsh.
  const start = nearestOnPath(
    pointAlong(BOARDWALK, BOARDWALK_START).x,
    pointAlong(BOARDWALK, BOARDWALK_START).z,
    BOARDWALK,
  );
  let walked = 0;
  for (let i = 1; i < BOARDWALK.length; i++) {
    const a = BOARDWALK[i - 1];
    const b = BOARDWALK[i];
    const leg = Math.hypot(b.x - a.x, b.z - a.z);
    const from = Math.max(0, start.along - walked);
    walked += leg;
    if (from >= leg) {
      continue;
    }
    const t0 = from / leg;
    const dx = (b.x - a.x) / leg;
    const dz = (b.z - a.z) / leg;
    const side = { x: -dz, z: dx };
    for (const s of [-1, 1]) {
      const offset = s * (BOARDWALK_WIDTH / 2 - 0.25);
      const p = {
        x: a.x + (b.x - a.x) * t0 + side.x * offset,
        z: a.z + (b.z - a.z) * t0 + side.z * offset,
      };
      const q = { x: b.x + side.x * offset, z: b.z + side.z * offset };
      const y = STEPS.bottom - PLANK.thickness - 0.1;
      parts.push(beam({ ...p, y }, { ...q, y }, [0.14, 0.2], WOOD_TONES[3]));
      for (let along = from + 0.6; along < leg; along += 1.8) {
        const x = a.x + dx * along + side.x * offset;
        const z = a.z + dz * along + side.z * offset;
        parts.push(post(x, z, jungleHeightAt(x, z) - 0.3, y, 0.09, WOOD_TONES[3]));
      }
    }
  }

  // The landing: planks across the axis from the top step to the deck.
  for (let z = LANDING.minZ + 0.14, i = 0; z < LANDING.maxZ; z += PLANK.pitch, i++) {
    parts.push(
      box(
        [LANDING.maxX - LANDING.minX, PLANK.thickness, PLANK.width],
        [(LANDING.minX + LANDING.maxX) / 2, DECK.height - PLANK.thickness / 2, z],
        WOOD_TONES[i % WOOD_TONES.length],
      ),
    );
  }
  for (const x of [LANDING.minX + 0.12, LANDING.maxX - 0.12]) {
    const z = LANDING.maxZ - 0.15;
    parts.push(
      post(x, z, jungleHeightAt(x, z) - 0.3, DECK.height - PLANK.thickness, 0.11, WOOD_TONES[3]),
    );
  }

  const geometry = assemble(parts);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The eleven steps: a thick tread each, two stringers rising under them from the boardwalk to the
 * landing, posts down to the marsh, and rope rails on posts either side. One geometry.
 */
function flightGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const tread = FLIGHT.length / STEPS.count;
  const across = { x: -FLIGHT.z, z: FLIGHT.x };
  const centres = stepCentres();

  centres.forEach((centre, i) => {
    parts.push(
      box(
        [STEP_WIDTH, 0.12, tread + 0.03],
        [centre.x, centre.y - 0.06, centre.z],
        WOOD_TONES[i % WOOD_TONES.length],
        FLIGHT_TURN,
      ),
    );
    // A riser under each tread's front edge, down to the one before.
    const front = { x: centre.x - FLIGHT.x * (tread / 2), z: centre.z - FLIGHT.z * (tread / 2) };
    const below = i === 0 ? STEPS.bottom : centres[i - 1].y;
    parts.push(
      box(
        [STEP_WIDTH - 0.1, centre.y - below, 0.04],
        [front.x, (centre.y + below) / 2 - 0.06, front.z],
        WOOD_TONES[(i + 2) % WOOD_TONES.length],
        FLIGHT_TURN,
      ),
    );
  });

  const foot = { ...STEPS.from, y: STEPS.bottom - 0.25 };
  const head = { ...STEPS.to, y: STEPS.top - 0.25 };
  for (const s of [-1, 1]) {
    const offset = s * (STEP_WIDTH / 2 - 0.12);
    const shift = (point: Pt & { readonly y: number }) => ({
      x: point.x + across.x * offset,
      y: point.y,
      z: point.z + across.z * offset,
    });
    parts.push(beam(shift(foot), shift(head), [0.12, 0.26], WOOD_TONES[3]));
    for (let i = 1; i < STEPS.count; i += 3) {
      const centre = centres[i];
      const x = centre.x + across.x * offset;
      const z = centre.z + across.z * offset;
      parts.push(post(x, z, jungleHeightAt(x, z) - 0.3, centre.y - 0.3, 0.09, WOOD_TONES[3]));
    }

    // Rope rails: posts every other step, a rope along their tops.
    const railOffset = s * (STEP_WIDTH / 2 - RAIL.inset);
    const tops: (Pt & { readonly y: number })[] = [];
    for (let i = 0; i < STEPS.count; i += 2) {
      const centre = centres[i];
      const x = centre.x + across.x * railOffset;
      const z = centre.z + across.z * railOffset;
      parts.push(post(x, z, centre.y - 0.12, centre.y + RAIL.height, 0.045, WOOD_TONES[1]));
      tops.push({ x, y: centre.y + RAIL.height - 0.05, z });
    }
    for (let i = 1; i < tops.length; i++) {
      parts.push(beam(tops[i - 1], tops[i], [0.035, 0.035], 0xb59a6a));
    }
  }

  const geometry = assemble(parts);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The inset strips along each tread's front, one instance per step, coloured by `setLit`. */
function inlayStrips(): InstancedMesh<BoxGeometry, MeshBasicMaterial> {
  const tread = FLIGHT.length / STEPS.count;
  const strips = new InstancedMesh(
    new BoxGeometry(STEP_WIDTH - 0.4, 0.014, 0.07),
    new MeshBasicMaterial({ color: 0xffffff }),
    STEPS.count,
  );
  strips.name = 'commit-steps-inlay';
  const cursor = new Object3D();
  stepCentres().forEach((centre, i) => {
    cursor.position.set(
      centre.x - FLIGHT.x * (tread / 2 - 0.08),
      centre.y + 0.004,
      centre.z - FLIGHT.z * (tread / 2 - 0.08),
    );
    cursor.rotation.set(0, FLIGHT_TURN, 0);
    cursor.updateMatrix();
    strips.setMatrixAt(i, cursor.matrix);
  });
  strips.instanceMatrix.needsUpdate = true;
  strips.computeBoundingSphere();
  return strips;
}

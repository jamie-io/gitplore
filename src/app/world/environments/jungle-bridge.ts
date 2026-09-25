import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { assemble, paint } from './flora';
import { ARCH, DECK, RILL, RILL_BED } from './jungle-layout';
import { seededRandom } from './random';
import { withAtmosphere } from './shaders/atmosphere';
import { HazedCopies } from './shaders/hazed-copies';
import { SharedUniforms } from './shaders/shared-uniforms';

/**
 * The Deslopify arch on the deck, the gate between the marsh and the glade: modelled in Blender
 * (scripts/blender/models/arch.py) to the hub portal's footprint, in the jungle's mossy stone.
 */
export const ARCH_MODEL = 'assets/models/jungle-arch.glb';

/** The material of the amber line round the arch, which glows as the slop lifts. */
export const ARCH_GLOW_MATERIAL = 'arch-glow';
/** The line's glow in the slop, and once the haze has gone. */
const ARCH_GLOW = { slop: 0.35, clear: 2.4 } as const;

/** The boardwalk's five plank tones, so the bridge reads as the same timber as the trail. */
export const WOOD_TONES: readonly number[] = [0x6a4a30, 0x5a3d27, 0x70523a, 0x4f3622, 0x634630];

/** A plank across the deck: its thickness, its width along the deck and the gap to the next. */
const PLANK = { thickness: 0.07, width: 0.27, pitch: 0.32 } as const;
/** Metres from the deck's centre line to each rail. */
const RAIL_X = DECK.halfWidth - 0.08;
/**
 * Metres from the deck's centre line to each arch pillar's centre, where the model
 * (scripts/blender/models/arch.py) stands them: on the deck's edges, over the rails.
 */
export const PILLAR_X = 1.4;
/** The model's pillar drums: 0.6 m across and 0.62 m deep, on plinths 0.9 m deep. */
const DRUM = { width: 0.6, depth: 0.62, plinthDepth: 0.9 } as const;
/** From a pillar's centre past its drums, so the visitor brushes past rather than into the stone. */
const PILLAR_REACH = 0.38;
/** The clear height under the model's arch, which the proxy's lintel keeps. */
const ARCH_CLEAR = 3.92;
/** Metres either side of the arch where the rails break for the pillars' plinths. */
const RAIL_GAP = DRUM.plinthDepth / 2 + 0.05;
const RAIL_HEIGHT = 1;

export interface JungleBridgeOptions {
  readonly shared: SharedUniforms;
}

/**
 * The only way over the rill: a plank deck 2.4 m up on two stringers and four piles, railed on both
 * sides, with the Deslopify arch standing across its middle. The commit steps climb to its south
 * end and a ramp of ground meets its north end. The deck is a collider with a walkable top, so the
 * visitor walks level across between the arch's pillars, which stand on its edges. The arch is the
 * hub portal's own model, loaded when the world is built; a stone proxy of the same shape stands
 * in until it arrives, and for good if it never does.
 */
export class JungleBridge implements WorldObject {
  readonly id = 'bridge';
  readonly colliders: readonly Collider[] = [
    {
      kind: 'aabb',
      minX: ARCH.x - DECK.halfWidth,
      maxX: ARCH.x + DECK.halfWidth,
      minZ: ARCH.z - DECK.halfLength,
      maxZ: ARCH.z + DECK.halfLength,
      top: DECK.height,
    },
    { kind: 'cylinder', x: ARCH.x - PILLAR_X, z: ARCH.z, radius: PILLAR_REACH },
    { kind: 'cylinder', x: ARCH.x + PILLAR_X, z: ARCH.z, radius: PILLAR_REACH },
  ];
  /**
   * Where the arch stands, on the deck under its middle. Public so the flow can light it; the
   * model or its proxy hangs below it.
   */
  readonly arch = new Group();

  private deck: Mesh | null = null;
  private proxy: Mesh | null = null;
  private model: Group | null = null;
  /** The model's materials hazed like the rest of the jungle; the amber line's glow among them. */
  private haze: HazedCopies | null = null;
  private glow: MeshStandardMaterial | null = null;
  private glowAmount = 0;
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;

  constructor(private readonly options: JungleBridgeOptions) {
    this.arch.name = 'deslopify-arch';
    this.arch.position.set(ARCH.x, DECK.height, ARCH.z);
  }

  init(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    const shadows = ctx.quality.shadows;
    const timber = withAtmosphere(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
      this.options.shared,
    );

    this.deck = new Mesh(bridgeGeometry(), timber);
    this.deck.name = 'bridge';
    this.deck.castShadow = shadows;
    this.deck.receiveShadow = shadows;
    ctx.scene.add(this.deck);

    this.proxy = new Mesh(
      archProxyGeometry(),
      withAtmosphere(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
        this.options.shared,
      ),
    );
    this.proxy.name = 'arch-proxy';
    this.proxy.castShadow = shadows;
    this.arch.add(this.proxy);
    ctx.scene.add(this.arch);

    // A missing model is no error worth showing: the proxy simply stays.
    ctx.assets.model(ARCH_MODEL).then(
      (model) => this.placeModel(ctx, model),
      () => undefined,
    );
  }

  update(): void {
    // Timber and stone: nothing moves.
  }

  /** How far Deslopify has cleared the air, 0 … 1: the arch's amber line glows with it. */
  setGlow(amount: number): void {
    this.glowAmount = amount;
    if (this.glow) {
      this.glow.emissiveIntensity = ARCH_GLOW.slop + (ARCH_GLOW.clear - ARCH_GLOW.slop) * amount;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.deck) {
      disposeObject3D(this.deck);
      this.deck = null;
    }
    if (this.proxy) {
      disposeObject3D(this.proxy);
      this.proxy = null;
    }
    if (this.model) {
      // The asset service owns the model's geometry and materials; hand the copy back instead.
      this.model.removeFromParent();
      this.model = null;
      this.assets?.releaseModel(ARCH_MODEL);
    }
    this.haze?.dispose();
    this.haze = null;
    this.glow = null;
    this.arch.removeFromParent();
  }

  private placeModel(ctx: WorldContext, model: Group): void {
    if (this.disposed) {
      // Too late: hand the copy straight back.
      ctx.assets.releaseModel(ARCH_MODEL);
      return;
    }
    const haze = (this.haze = new HazedCopies(this.options.shared));
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
        object.receiveShadow = ctx.quality.shadows;
        const copy = haze.of(object.material as Material);
        if (copy.name === ARCH_GLOW_MATERIAL && copy instanceof MeshStandardMaterial) {
          this.glow = copy;
        }
        object.material = copy;
      }
    });
    this.setGlow(this.glowAmount);
    model.name = 'arch-model';
    this.model = model;
    this.arch.add(model);
    if (this.proxy) {
      disposeObject3D(this.proxy);
      this.proxy = null;
    }
  }
}

/** A box `size` big centred on `at` (deck-local: x across, y up from the deck's top, z along). */
function box(
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  colour: number,
  turn = 0,
): BufferGeometry {
  return paint(new BoxGeometry(...size).rotateY(turn).translate(at[0], at[1], at[2]), colour);
}

/** A post of `radius` from `bottom` to `top` (deck-local heights) at (x, z). */
function post(
  x: number,
  z: number,
  bottom: number,
  top: number,
  radius: number,
  colour: number,
): BufferGeometry {
  return paint(
    new CylinderGeometry(radius * 0.85, radius, top - bottom, 7).translate(
      x,
      (top + bottom) / 2,
      z,
    ),
    colour,
  );
}

/**
 * The deck, stringers, piles and rails in world space, merged into one vertex-coloured geometry:
 * one draw call for the whole bridge. Planks are laid across the deck in the boardwalk's tones,
 * each a touch out of true, as hand-laid planks are.
 */
function bridgeGeometry(): BufferGeometry {
  const random = seededRandom(91);
  const parts: BufferGeometry[] = [];
  const length = DECK.halfLength * 2;
  const planks = Math.floor(length / PLANK.pitch);
  const start = -((planks - 1) * PLANK.pitch) / 2;

  for (let i = 0; i < planks; i++) {
    const z = start + i * PLANK.pitch;
    const lift = (random() - 0.5) * 0.02;
    const turn = (random() - 0.5) * 0.03;
    parts.push(
      box(
        [DECK.halfWidth * 2 + 0.1, PLANK.thickness, PLANK.width],
        [0, -PLANK.thickness / 2 + lift, z],
        WOOD_TONES[i % WOOD_TONES.length],
        turn,
      ),
    );
  }

  // Two stringers under the planks, the length of the deck and a little more.
  for (const side of [-1, 1]) {
    parts.push(box([0.16, 0.24, length + 0.4], [side * (RAIL_X - 0.3), -0.19, 0], WOOD_TONES[3]));
  }

  // Piles down to the bed at the water's edges, where the stringers need them.
  const bed = RILL_BED - DECK.height;
  for (const along of [-1, 1]) {
    for (const side of [-1, 1]) {
      parts.push(
        post(side * (RAIL_X - 0.3), along * RILL.halfWidth * 0.85, bed, -0.3, 0.12, WOOD_TONES[3]),
      );
    }
  }

  // Rails either side, each in two runs that stop short of the arch's pillars, which stand on the
  // deck's edges: a post at both ends of a run, a top rail and a middle one between them.
  const near = RAIL_GAP;
  const far = DECK.halfLength - 0.1;
  const run = far - near;
  for (const side of [-1, 1]) {
    for (const along of [-1, 1]) {
      const middle = (along * (near + far)) / 2;
      for (const [i, z] of [near + 0.06, far - 0.05].entries()) {
        parts.push(
          post(side * RAIL_X, along * z, 0, RAIL_HEIGHT, 0.06, WOOD_TONES[i % 2 === 0 ? 1 : 3]),
        );
      }
      parts.push(
        box([0.08, 0.07, run], [side * RAIL_X, RAIL_HEIGHT - 0.035, middle], WOOD_TONES[0]),
      );
      parts.push(box([0.05, 0.05, run], [side * RAIL_X, 0.5, middle], WOOD_TONES[2]));
    }
  }

  const geometry = assemble(parts);
  geometry.translate(ARCH.x, DECK.height, ARCH.z);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The arch's stand-in, in the model's own frame (the deck's top at y = 0): two stone pillars on the
 * deck's edges where the model's stand, under a lintel as high as the model's arch is clear: the
 * shape the model has, in its greys.
 */
function archProxyGeometry(): BufferGeometry {
  const radius = DRUM.width / 2;
  return assemble([
    post(-PILLAR_X, 0, 0, ARCH_CLEAR, radius, 0x80848f),
    post(PILLAR_X, 0, 0, ARCH_CLEAR, radius, 0x80848f),
    box([PILLAR_X * 2 + DRUM.width, 0.55, DRUM.depth], [0, ARCH_CLEAR + 0.275, 0], 0x707480),
  ]);
}

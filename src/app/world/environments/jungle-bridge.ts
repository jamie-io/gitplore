import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { assemble, paint } from './flora';
import { ARCH, BRIDGE, STREAM, WATER_LEVEL } from './jungle-layout';
import { seededRandom } from './random';
import { withAtmosphere } from './shaders/atmosphere';
import { SharedUniforms } from './shaders/shared-uniforms';

/** The Deslopify arch the hub's portal wears, set on the bridge as the gate between the banks. */
export const ARCH_MODEL = 'assets/models/arch.glb';

/** The boardwalk's five plank tones, so the bridge reads as the same timber as the trail. */
export const WOOD_TONES: readonly number[] = [0x6a4a30, 0x5a3d27, 0x70523a, 0x4f3622, 0x634630];

/** A plank across the deck: its thickness, its width along the deck and the gap to the next. */
const PLANK = { thickness: 0.07, width: 0.27, pitch: 0.32 } as const;
/** Metres from the deck's centre line to each rail and to each arch pillar's centre. */
const RAIL_X = BRIDGE.halfWidth - 0.08;
export const PILLAR_X = 1.4;
/** A pillar's radius plus a hand's width, so the visitor brushes past rather than into the stone. */
const PILLAR_REACH = 0.38;
const RAIL_HEIGHT = 1;
/** Rail posts keep this far from the arch's pillars along the deck. */
const ARCH_GAP = 0.6;

export interface JungleBridgeOptions {
  readonly shared: SharedUniforms;
}

/**
 * The only way over the stream: a plank deck on two stringers and four piles, railed on both
 * sides, with the Deslopify arch standing across its middle. The deck is a collider with a walkable
 * top, so the visitor steps up onto it and walks level across; the arch's pillars are walls either
 * side of the walkway. The arch is the hub portal's own model, loaded when the world is built; a
 * stone proxy of the same shape stands in until it arrives, and for good if it never does.
 */
export class JungleBridge implements WorldObject {
  readonly id = 'bridge';
  readonly colliders: readonly Collider[] = [
    {
      kind: 'aabb',
      minX: BRIDGE.centre.x - BRIDGE.halfWidth,
      maxX: BRIDGE.centre.x + BRIDGE.halfWidth,
      minZ: BRIDGE.centre.z - BRIDGE.halfLength,
      maxZ: BRIDGE.centre.z + BRIDGE.halfLength,
      top: BRIDGE.deckHeight,
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
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;

  constructor(private readonly options: JungleBridgeOptions) {
    this.arch.name = 'deslopify-arch';
    this.arch.position.copy(ARCH);
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
    this.arch.removeFromParent();
  }

  private placeModel(ctx: WorldContext, model: Group): void {
    if (this.disposed) {
      // Too late: hand the copy straight back.
      ctx.assets.releaseModel(ARCH_MODEL);
      return;
    }
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
        object.receiveShadow = ctx.quality.shadows;
      }
    });
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
  const length = BRIDGE.halfLength * 2;
  const planks = Math.floor(length / PLANK.pitch);
  const start = -((planks - 1) * PLANK.pitch) / 2;

  for (let i = 0; i < planks; i++) {
    const z = start + i * PLANK.pitch;
    const lift = (random() - 0.5) * 0.02;
    const turn = (random() - 0.5) * 0.03;
    parts.push(
      box(
        [BRIDGE.halfWidth * 2 + 0.1, PLANK.thickness, PLANK.width],
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
  const bed = WATER_LEVEL - STREAM.depth - BRIDGE.deckHeight;
  for (const along of [-1, 1]) {
    for (const side of [-1, 1]) {
      parts.push(
        post(
          side * (RAIL_X - 0.3),
          along * STREAM.halfWidth * 0.85,
          bed,
          -0.3,
          0.12,
          WOOD_TONES[3],
        ),
      );
    }
  }

  // Rail posts every metre and a quarter, stopping short of the arch's pillars, with a top rail.
  const posts = Math.floor(length / 1.25);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= posts; i++) {
      const z = -BRIDGE.halfLength + 0.15 + (i * (length - 0.3)) / posts;
      if (Math.abs(z) < ARCH_GAP) {
        continue;
      }
      parts.push(post(side * RAIL_X, z, 0, RAIL_HEIGHT, 0.06, WOOD_TONES[i % 2 === 0 ? 1 : 3]));
    }
    parts.push(
      box([0.08, 0.07, length - 0.2], [side * RAIL_X, RAIL_HEIGHT - 0.035, 0], WOOD_TONES[0]),
    );
    parts.push(box([0.05, 0.05, length - 0.2], [side * RAIL_X, 0.5, 0], WOOD_TONES[2]));
  }

  const geometry = assemble(parts);
  geometry.translate(BRIDGE.centre.x, BRIDGE.deckHeight, BRIDGE.centre.z);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The arch's stand-in, in the model's own frame (the deck's top at y = 0): two stone pillars
 * 2.8 m apart under a lintel, the shape the model has, in its greys.
 */
function archProxyGeometry(): BufferGeometry {
  return assemble([
    post(-PILLAR_X, 0, 0, 3.6, 0.35, 0x80848f),
    post(PILLAR_X, 0, 0, 3.6, 0.35, 0x80848f),
    box([PILLAR_X * 2 + 1, 0.55, 0.8], [0, 4.2, 0], 0x707480),
  ]);
}

import { BoxGeometry, BufferGeometry, Group, Material, Mesh, MeshStandardMaterial } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { CLIFF_LIP, assemble, cliffWall, paint } from './flora';
import { CAVE, CLIFF, WATERFALL } from './jungle-layout';
import { withAtmosphere } from './shaders/atmosphere';
import { HazedCopies } from './shaders/hazed-copies';
import { SharedUniforms } from './shaders/shared-uniforms';

/**
 * The cliff and its cave, modelled in Blender (scripts/blender/models/cave_cliff.py): a faceted face
 * about 30 m wide and 9 m tall facing +Z, with the waterfall's notch and the cave behind it. Its
 * origin is the foot of the face at the cave's mouth, on the cave's floor. `cave_floor` is the
 * walkable floor; `collider` is a low-poly hull of the walls for the author's eyes only, hidden here:
 * the walls' colliders are the boxes below, fixed before the model can arrive.
 */
export const CAVE_CLIFF_MODEL = 'assets/models/cave-cliff.glb';
export const CAVE_FLOOR_NODE = 'cave_floor';
export const CAVE_COLLIDER_NODE = 'collider';

/** Metres from the cliff's face back to the origin of its rock columns, deep enough that none stands proud of the face. */
const COLUMN_SETBACK = 2.5;
/** The flush rock round the cave's mouth and under the falls: how far either side of the cave, and how deep. */
const MOUTH = { reach: 0.8, depth: 1.5 } as const;
/** The cave's lining: its walls' thickness. */
const LINING = 0.3;
/** How far the rock's colliders reach back into the cliff, and past its ends into the rim. */
const ROCK_DEPTH = 10;
const ROCK_OVERHANG = 1;
const ROCKS = [0x6f6a5f, 0x7d776a, 0x5f5a50] as const;

/**
 * The rock no one walks into: the face either side of the cave, from the face back into the cliff,
 * and the rock behind the cave's back wall. Only the cave's inside is open, and only through its
 * mouth behind the falls.
 */
function rockColliders(): Collider[] {
  const left = -CLIFF.width / 2 - ROCK_OVERHANG;
  const right = CLIFF.width / 2 + ROCK_OVERHANG;
  const back = CLIFF.z - ROCK_DEPTH;
  return [
    { kind: 'aabb', minX: left, maxX: CAVE.x0, minZ: back, maxZ: CLIFF.z },
    { kind: 'aabb', minX: CAVE.x1, maxX: right, minZ: back, maxZ: CLIFF.z },
    { kind: 'aabb', minX: CAVE.x0, maxX: CAVE.x1, minZ: back, maxZ: CAVE.z0 },
  ];
}

export interface JungleCaveOptions {
  readonly shared: SharedUniforms;
}

/**
 * The rock face across the bowl's north end and the cave in it, behind the waterfall: the columns
 * of the jungle's cliff, a flush face round the cave's mouth for the water to pour over, and a
 * lined cave 3.2 m wide and 2.6 m tall inside. The terrain carries the cave's floor. The face is
 * Blender-authored when `cave-cliff.glb` is there; until it arrives, and for good if it never does,
 * the procedural rock stands.
 */
export class JungleCave implements WorldObject {
  readonly id = 'cave-cliff';
  readonly colliders: readonly Collider[] = rockColliders();

  private rock: Mesh | null = null;
  private model: Group | null = null;
  private haze: HazedCopies | null = null;
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;

  constructor(private readonly options: JungleCaveOptions) {}

  init(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    this.rock = new Mesh(
      cliffGeometry(),
      withAtmosphere(
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
        this.options.shared,
      ),
    );
    this.rock.name = 'cliff';
    this.rock.castShadow = ctx.quality.shadows;
    this.rock.receiveShadow = ctx.quality.shadows;
    ctx.scene.add(this.rock);

    // A missing model is no error worth showing: the procedural rock simply stays.
    ctx.assets.model(CAVE_CLIFF_MODEL).then(
      (model) => this.placeModel(ctx, model),
      () => undefined,
    );
  }

  update(): void {
    // Rock: nothing moves.
  }

  dispose(): void {
    this.disposed = true;
    if (this.rock) {
      disposeObject3D(this.rock);
      this.rock = null;
    }
    if (this.model) {
      // The asset service owns the model's geometry and materials; hand the copy back instead.
      this.model.removeFromParent();
      this.model = null;
      this.assets?.releaseModel(CAVE_CLIFF_MODEL);
    }
    this.haze?.dispose();
    this.haze = null;
  }

  private placeModel(ctx: WorldContext, model: Group): void {
    if (this.disposed) {
      ctx.assets.releaseModel(CAVE_CLIFF_MODEL);
      return;
    }
    const haze = (this.haze = new HazedCopies(this.options.shared));
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = ctx.quality.shadows;
        object.receiveShadow = ctx.quality.shadows;
        object.material = Array.isArray(object.material)
          ? object.material.map((material: Material) => haze.of(material))
          : haze.of(object.material as Material);
      }
    });
    const hull = model.getObjectByName(CAVE_COLLIDER_NODE);
    if (hull) {
      hull.visible = false;
    }
    model.name = 'cave-cliff-model';
    model.position.set((CAVE.x0 + CAVE.x1) / 2, CAVE.floor, CLIFF.z);
    this.model = model;
    ctx.scene.add(model);
    if (this.rock) {
      disposeObject3D(this.rock);
      this.rock = null;
    }
  }
}

/** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1), in world space. */
function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  colour: number,
): BufferGeometry {
  return paint(
    new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
    ),
    colour,
  );
}

/**
 * The procedural cliff in world space, one geometry: the jungle's rock columns with the cave cut
 * out of them, their notch topping out at the waterfall's lip; a flush face round the cave's mouth
 * and up to the lip, so the water falls down rock rather than in front of a recess; and the cave's
 * lining, its side walls, back and roof.
 */
function cliffGeometry(): BufferGeometry {
  const origin = CLIFF.z - COLUMN_SETBACK;
  const roof = CAVE.floor + CAVE.height;
  const centre = (CAVE.x0 + CAVE.x1) / 2;
  const notchWidth = WATERFALL.x1 - WATERFALL.x0 + 1;
  // cliffWall tops its notch at `height · CLIFF_LIP`: that is the waterfall's lip.
  const columns = cliffWall(
    71,
    CLIFF.width,
    WATERFALL.top / CLIFF_LIP,
    { x: (WATERFALL.x0 + WATERFALL.x1) / 2, width: notchWidth },
    {
      x: centre,
      width: CAVE.x1 - CAVE.x0 + LINING * 2,
      height: roof + LINING,
      back: CAVE.z0 - LINING - origin,
    },
  ).translate(0, 0, origin);
  // Assembled already, with its normals; `assemble` recomputes them over the whole cliff.
  columns.deleteAttribute('normal');

  const left = CAVE.x0 - LINING;
  const right = CAVE.x1 + LINING;
  const outerLeft = CAVE.x0 - MOUTH.reach;
  const outerRight = CAVE.x1 + MOUTH.reach;
  const face = CLIFF.z;
  const deep = CLIFF.z - MOUTH.depth;
  const parts = [
    columns,
    // The flush face: beside the mouth, and over it up to the lip.
    slab(outerLeft, left, -1, roof + LINING, deep, face, ROCKS[1]),
    slab(right, outerRight, -1, roof + LINING, deep, face, ROCKS[1]),
    slab(outerLeft, outerRight, roof + LINING, WATERFALL.top, deep, face, ROCKS[0]),
    // The cave's lining: side walls, back wall and roof.
    slab(left, CAVE.x0, -1, roof, CAVE.z0 - LINING, face, ROCKS[2]),
    slab(CAVE.x1, right, -1, roof, CAVE.z0 - LINING, face, ROCKS[2]),
    slab(left, right, -1, roof, CAVE.z0 - LINING, CAVE.z0, ROCKS[2]),
    slab(left, right, roof, roof + LINING, CAVE.z0 - LINING, face, ROCKS[0]),
  ];
  const geometry = assemble(parts);
  geometry.computeBoundingSphere();
  return geometry;
}

import { BufferGeometry, Matrix4, Object3D, Vector3 } from 'three';
import { bakeGeometry, markerPosition, mergeBaked, tintGeometry } from './model-geometry';
import { HouseSpot, HouseVariant } from './plaza-layout';

/**
 * The Plaza's Blender-authored models (scripts/blender/models/plaza_*.py) and how their parts are
 * dressed for the square: pure geometry, so a spec can check a house's colours without a scene.
 */
export const PLAZA_MODELS = {
  house: (variant: HouseVariant) => `assets/models/plaza-house-${variant}.glb`,
  corner: 'assets/models/plaza-corner.glb',
  fountain: 'assets/models/plaza-fountain.glb',
  arch: 'assets/models/plaza-arch.glb',
  board: 'assets/models/plaza-board.glb',
  mast: 'assets/models/plaza-mast.glb',
  bench: 'assets/models/plaza-bench.glb',
  cypress: 'assets/models/plaza-cypress.glb',
} as const;

/**
 * A house or corner model's parts, baked into the model's frame. `stucco`, `shutters` and `awning`
 * are white with their ambient occlusion, for the tint of the spot they stand on; `trim` carries
 * its own colours. `lamp` is the centre of the wall lamp's glass, on the houses that have one.
 */
export interface TownModel {
  readonly stucco: BufferGeometry;
  readonly shutters: BufferGeometry;
  readonly trim: BufferGeometry;
  readonly awning: BufferGeometry | null;
  readonly lamp: Vector3 | null;
}

/** Bakes a house or corner model, or null if one of its painted parts is missing. */
export function townModel(model: Object3D): TownModel | null {
  const part = (name: string) => {
    const node = model.getObjectByName(name);
    return node ? bakeGeometry(node) : null;
  };
  const stucco = part('stucco');
  const shutters = part('shutters');
  const trim = part('trim');
  if (!stucco || !shutters || !trim) {
    [stucco, shutters, trim].forEach((geometry) => geometry?.dispose());
    return null;
  }
  return { stucco, shutters, trim, awning: part('awning'), lamp: markerPosition(model, 'lamp') };
}

export function disposeTownModel(model: TownModel): void {
  [model.stucco, model.shutters, model.trim, model.awning].forEach((part) => part?.dispose());
}

export interface TownPaint {
  readonly stucco: number;
  readonly shutters: number;
  readonly awning?: number;
}

/** Stretched along the house's own X, turned and set on its spot. */
function houseMatrix(x: number, z: number, rotationY: number, stretch: number): Matrix4 {
  return new Matrix4()
    .makeRotationY(rotationY)
    .setPosition(x, 0, z)
    .multiply(new Matrix4().makeScale(stretch, 1, 1));
}

function dressed(model: TownModel, paint: TownPaint, matrix: Matrix4): BufferGeometry {
  const parts = [
    tintGeometry(model.stucco.clone(), paint.stucco),
    tintGeometry(model.shutters.clone(), paint.shutters),
    model.trim.clone(),
  ];
  if (model.awning) {
    // A house whose row drew no awning colour still has the canvas: it stays white and grey.
    parts.push(tintGeometry(model.awning.clone(), paint.awning ?? 0xffffff));
  }
  return mergeBaked(parts.map((part) => part.applyMatrix4(matrix)));
}

/** One house of the square from its variant's model: tinted, stretched and placed on its spot. */
export function dressedHouse(spot: HouseSpot, model: TownModel): BufferGeometry {
  return dressed(model, spot.options, houseMatrix(spot.x, spot.z, spot.rotationY, spot.stretch));
}

/** One corner block from the corner model, its pivot on the corner nearest the fountain. */
export function dressedCorner(
  corner: { readonly x: number; readonly z: number; readonly rotationY: number },
  model: TownModel,
  paint: TownPaint,
): BufferGeometry {
  return dressed(model, paint, houseMatrix(corner.x, corner.z, corner.rotationY, 1));
}

/** Where a house's wall lamp glows in the square, or null if its variant has none. */
export function lampAt(spot: HouseSpot, model: TownModel): Vector3 | null {
  return model.lamp
    ? model.lamp.clone().applyMatrix4(houseMatrix(spot.x, spot.z, spot.rotationY, spot.stretch))
    : null;
}

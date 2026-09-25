import { Material, MeshStandardMaterial } from 'three';
import { withAtmosphere } from './atmosphere';
import { SharedUniforms } from './shared-uniforms';

/**
 * Copies of loaded models' materials that go through the environment's atmosphere, like every
 * surface the environment builds itself, so a prop from a glTF stands in the same haze as the
 * trees beside it. The asset service shares a model's materials between all its copies, so they
 * are never patched in place; each original gets one hazed copy, shared by every mesh that wears
 * it, and freed with `dispose`.
 */
export class HazedCopies {
  private readonly copies = new Map<Material, Material>();

  constructor(private readonly shared: SharedUniforms) {}

  /** The hazed copy of `material`; anything but a standard material is returned as it is. */
  of(material: Material): Material {
    if (!(material instanceof MeshStandardMaterial)) {
      return material;
    }
    let copy = this.copies.get(material);
    if (!copy) {
      copy = withAtmosphere(material.clone(), this.shared);
      this.copies.set(material, copy);
    }
    return copy;
  }

  /** Hazes a material the caller owns and disposes itself, in place rather than by copy. */
  own<T extends MeshStandardMaterial>(material: T): T {
    return withAtmosphere(material, this.shared);
  }

  dispose(): void {
    for (const copy of this.copies.values()) {
      copy.dispose();
    }
    this.copies.clear();
  }
}

import { Vector3 } from 'three';
import { ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { SprayBooth } from './spray-booth';

/** Metres to the side of the exhibit board, far enough that the booth is a second thing to walk to. */
const BOOTH_OFFSET = 11;

/**
 * Phönix's own world: the neutral showroom with the product it sells standing in it at full size.
 * The site is a dependency-free brochure, so the world gives a visitor the one thing a brochure
 * cannot — the booth's scale, from inside it.
 */
export class NovavertaScene extends ProjectScene {
  readonly booth: SprayBooth;

  constructor(options: ProjectSceneOptions) {
    super(options);

    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );

    this.booth = new SprayBooth({
      origin: this.exhibit.position.clone().addScaledVector(side, -BOOTH_OFFSET),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
      accent: options.project.theme.primary,
    });

    this.add(this.booth);
  }
}

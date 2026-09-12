import { Vector3 } from 'three';
import { ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { PlantRoom } from './plant-room';

/** Metres to the side of the exhibit board. */
const PLANT_OFFSET = 10;

/**
 * Pötzsch's own world: the neutral showroom with the plant a building-services firm installs, and
 * with every supply line stopping where you can see it — the site's own claim to make no external
 * connections, rendered as the trade it belongs to.
 */
export class PoetzscherScene extends ProjectScene {
  readonly plant: PlantRoom;

  constructor(options: ProjectSceneOptions) {
    super(options);

    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );

    this.plant = new PlantRoom({
      origin: this.exhibit.position.clone().addScaledVector(side, PLANT_OFFSET),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
      accent: options.project.theme.primary,
    });

    this.add(this.plant);
  }
}

import { Vector3 } from 'three';
import { ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { CatalogueBays } from './catalogue-bays';
import { TradeCounter } from './trade-counter';

/** Metres to either side of the exhibit board. */
const BAYS_OFFSET = 8;
const COUNTER_OFFSET = 9;
/** The counter stands a little further into the hall than the bays, towards the way out. */
const COUNTER_FORWARD = 6;

/**
 * Nordwerk's own world: the neutral showroom, furnished. The bays carry the article numbers and
 * prices the shop would have fetched from the WebKatalog, and the desk can be reconfigured where
 * it stands — which is the repository's own subject rather than decoration around it.
 *
 * The hall itself stays `ShowroomEnvironment`, so the default a repository nobody has styled leads
 * to is untouched for the projects still using it.
 */
export class WebkatalogScene extends ProjectScene {
  readonly bays: CatalogueBays;
  readonly counter: TradeCounter;

  constructor(options: ProjectSceneOptions) {
    super(options);

    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );
    const front = new Vector3(
      Math.sin(this.exhibit.rotationY),
      0,
      Math.cos(this.exhibit.rotationY),
    );

    this.bays = new CatalogueBays({
      origin: this.exhibit.position.clone().addScaledVector(side, -BAYS_OFFSET),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
      accent: options.project.theme.primary,
    });
    this.counter = new TradeCounter({
      origin: this.exhibit.position
        .clone()
        .addScaledVector(side, COUNTER_OFFSET)
        .addScaledVector(front, COUNTER_FORWARD),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
    });

    this.add(this.bays);
    this.add(this.counter);
  }
}

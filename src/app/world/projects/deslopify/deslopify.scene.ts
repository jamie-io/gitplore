import { Vector3 } from 'three';
import { InWorldDemo, ProjectScene, ProjectSceneOptions } from '../../project/project.scene';
import { VideoWall } from './video-wall';

/** Metres to the side of the exhibit board where the wall stands. */
const WALL_OFFSET = 6.5;

/**
 * Deslopify's own world: the jungle, the exhibit board, the way back, and the wall of
 * mistranslated video titles that used to hang off the hub's portal (spec §5).
 */
export class DeslopifyScene extends ProjectScene {
  readonly wall: VideoWall;

  constructor(options: ProjectSceneOptions) {
    super(options);

    // Beside the exhibit, turned the same way, so both face an arriving visitor.
    const side = new Vector3(
      Math.cos(this.exhibit.rotationY),
      0,
      -Math.sin(this.exhibit.rotationY),
    );
    this.wall = new VideoWall({
      origin: this.exhibit.position.clone().addScaledVector(side, WALL_OFFSET),
      rotationY: this.exhibit.rotationY,
      ground: this.environment.ground,
      accent: options.project.theme.primary,
      reducedMotion: options.reducedMotion,
      onDemo: () => options.onDemo?.(),
    });
    this.add(this.wall);
  }

  /** The wall is what "try it in the world" runs; the director asks the scene for it. */
  override get demo(): InWorldDemo {
    return this.wall;
  }
}

import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { WorldContext } from '@engine/world-object';
import { createLabel } from './label';
import { Landmark, LandmarkOptions, LandmarkShape } from './landmark';
import { createPosterMaterial, type PosterComparison } from './poster';

const SCREEN_WIDTH = 3.2;
const SCREEN_HEIGHT = 2;
const SCREEN_DEPTH = 0.16;
/** Height of the screen's centre above the ground. */
export const SCREEN_CENTRE = 1.9;
const INTERACT_RADIUS = 4;

export interface ScreenLandmarkOptions extends LandmarkOptions {
  readonly comparison?: PosterComparison;
  readonly englishSummary?: string;
  readonly kicker?: string;
  readonly prompt?: string;
}

/**
 * A billboard showing the project's screenshot (IMPLEMENTATION_PLAN.md §5): the in-world stand-in
 * for the live demo, which opens in the panel.
 */
export class ScreenLandmark extends Landmark {
  private screenshotUrl: string | null = null;
  private readonly comparison?: PosterComparison;
  private readonly englishSummary?: string;
  private readonly kicker?: string;
  private readonly prompt?: string;

  constructor(options: ScreenLandmarkOptions) {
    super(options);
    this.comparison = options.comparison;
    this.englishSummary = options.englishSummary;
    this.kicker = options.kicker;
    this.prompt = options.prompt;
  }

  protected describe(): LandmarkShape {
    return {
      colliders: [this.footprint()],
      interactables: [
        {
          id: this.id,
          position: this.position.clone(),
          radius: INTERACT_RADIUS,
          prompt: this.prompt ?? `${this.project.title} ansehen`,
          onInteract: () => this.onEnter(this.project),
        },
      ],
    };
  }

  protected build(ctx: WorldContext): void {
    const frame = new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.2 });

    const bodyHeight = SCREEN_HEIGHT + 0.2;
    const postHeight = SCREEN_CENTRE - bodyHeight / 2;
    const post = new Mesh(new CylinderGeometry(0.12, 0.16, postHeight, 8), frame);
    post.name = 'post';
    post.position.set(0, postHeight / 2, 0);
    post.castShadow = ctx.quality.shadows;
    this.group.add(post);

    const body = new Mesh(new BoxGeometry(SCREEN_WIDTH + 0.2, bodyHeight, SCREEN_DEPTH), frame);
    body.name = 'body';
    body.position.set(0, SCREEN_CENTRE, 0);
    body.castShadow = ctx.quality.shadows;
    this.group.add(body);

    const surface = new Mesh(new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), this.screenMaterial());
    surface.name = 'surface';
    surface.position.set(0, SCREEN_CENTRE, SCREEN_DEPTH / 2 + 0.01);
    this.group.add(surface);

    const label = createLabel(this.project.title, this.project.theme.primary);
    if (label) {
      label.position.set(0, SCREEN_CENTRE + SCREEN_HEIGHT / 2 + 0.55, 0.05);
      this.group.add(label);
    }
  }

  override dispose(): void {
    super.dispose();
    if (this.screenshotUrl) {
      this.textures.release(this.screenshotUrl);
      this.screenshotUrl = null;
    }
  }

  private screenMaterial(): MeshStandardMaterial | MeshBasicMaterial {
    const demo = this.project.demo;
    if (demo.kind !== 'iframe') {
      return createPosterMaterial(this.project, {
        comparison: this.comparison,
        englishSummary: this.englishSummary,
        kicker: this.kicker,
      });
    }

    this.screenshotUrl = demo.screenshot;
    const map = this.textures.load(demo.screenshot);
    // Screenshots are sRGB; without saying so the renderer would gamma-correct them twice.
    map.colorSpace = SRGBColorSpace;
    // Emissive so the screen reads as lit from inside, whatever the sun does.
    return new MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    });
  }

  /** Axis-aligned bounds of the rotated screen body, on the ground. */
  private footprint() {
    const halfW = SCREEN_WIDTH / 2 + 0.3;
    const halfD = SCREEN_DEPTH / 2 + 0.4;
    const corners = [
      this.toWorld(-halfW, 0, -halfD),
      this.toWorld(halfW, 0, -halfD),
      this.toWorld(-halfW, 0, halfD),
      this.toWorld(halfW, 0, halfD),
    ];
    return {
      kind: 'aabb' as const,
      minX: Math.min(...corners.map((c) => c.x)),
      maxX: Math.max(...corners.map((c) => c.x)),
      minZ: Math.min(...corners.map((c) => c.z)),
      maxZ: Math.max(...corners.map((c) => c.z)),
    };
  }
}

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext } from '@engine/world-object';
import type { InWorldDemo, SceneObject } from '../../project/project.scene';

/**
 * Fictional videos standing in for what Deslopify fixes: YouTube's auto-translated titles.
 * The "slop" column is the kind of mistranslation the extension replaces with the original.
 */
export const EXAMPLE_VIDEOS: readonly { readonly original: string; readonly slop: string }[] = [
  { original: 'Rust in 100 Seconds', slop: 'Rost in 100 Sekunden' },
  {
    original: 'I built a keyboard from scratch',
    slop: 'Ich habe eine Tastatur von Kratzer gebaut',
  },
  { original: 'Why the sky is blue', slop: 'Warum der Himmel blau ist' },
  { original: 'Git rebase, explained', slop: 'Git Basis neu, erklärt' },
];

const CARD_WIDTH = 1.9;
const CARD_HEIGHT = 1.3;
const CARD_GAP = 0.2;
const WALL_CENTRE_Y = 2;
const WALL_DEPTH = 0.2;
const VIEWPOINT_DISTANCE = 4.2;
const INTERACT_RADIUS = 4.5;

/** Seconds a card takes to flip; skipped under reduced motion. */
const FLIP_SECONDS = 0.3;

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 352;

export interface VideoWallOptions {
  /** Ground-level centre of the wall. */
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
  readonly accent: string;
  readonly reducedMotion: () => boolean;
  readonly onDemo: () => void;
}

/**
 * The wall of video cards that shows what Deslopify fixes. It used to hang off the hub's portal;
 * now it stands in Deslopify's own world, which is where a demo of the project belongs (spec §5).
 */
export class VideoWall implements SceneObject, InWorldDemo {
  readonly id = 'deslopify:wall';
  readonly demoHint = 'E: Originaltitel ein- und ausblenden · Esc: Demo verlassen';
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];

  private readonly group = new Group();
  private readonly centre: Vector3;
  private readonly options: VideoWallOptions;
  private cards: { mesh: Mesh; slop: MeshBasicMaterial; original: MeshBasicMaterial }[] = [];
  private originals = false;
  private flip: { elapsed: number } | null = null;

  constructor(options: VideoWallOptions) {
    this.options = options;
    this.centre = options.origin.clone();
    this.centre.y = options.ground.heightAt(this.centre.x, this.centre.z);
    this.group.position.copy(this.centre);
    this.group.rotation.y = options.rotationY;
    this.group.name = this.id;

    const width = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP);
    const rotation = new Euler(0, options.rotationY, 0);
    const corners = [-width / 2, width / 2].flatMap((x) =>
      [-0.6, 0.6].map((z) => new Vector3(x, 0, z).applyEuler(rotation).add(this.centre)),
    );
    this.colliders = [
      {
        kind: 'aabb',
        minX: Math.min(...corners.map((corner) => corner.x)),
        maxX: Math.max(...corners.map((corner) => corner.x)),
        minZ: Math.min(...corners.map((corner) => corner.z)),
        maxZ: Math.max(...corners.map((corner) => corner.z)),
      },
    ];
    this.interactables = [
      {
        id: `${this.id}:demo`,
        position: this.centre.clone(),
        radius: INTERACT_RADIUS,
        prompt: 'Deslopify ausprobieren',
        onInteract: () => options.onDemo(),
      },
    ];
  }

  get showingOriginals(): boolean {
    return this.originals;
  }

  /** Unit vector pointing out of the wall's face, towards approaching visitors. */
  private front(): Vector3 {
    return new Vector3(Math.sin(this.options.rotationY), 0, Math.cos(this.options.rotationY));
  }

  init(ctx: WorldContext): void {
    const wallWidth = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP) + CARD_GAP;
    const backing = new Mesh(
      new BoxGeometry(wallWidth, CARD_HEIGHT + 2 * CARD_GAP + 0.5, WALL_DEPTH),
      new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 }),
    );
    backing.name = 'video-wall';
    backing.position.set(0, WALL_CENTRE_Y, 0);
    backing.castShadow = ctx.quality.shadows;
    this.group.add(backing);

    const accent = new Color(this.options.accent);
    EXAMPLE_VIDEOS.forEach((video, index) => {
      const slop = cardMaterial(video.slop, `#${accent.getHexString()}`, index);
      const original = cardMaterial(video.original, '#1b7f4f', index);
      const mesh = new Mesh(new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), slop);
      mesh.name = `card:${index}`;
      mesh.position.set(
        (index - (EXAMPLE_VIDEOS.length - 1) / 2) * (CARD_WIDTH + CARD_GAP),
        WALL_CENTRE_Y + 0.15,
        WALL_DEPTH / 2 + 0.01,
      );
      this.group.add(mesh);
      this.cards.push({ mesh, slop, original });
    });

    ctx.scene.add(this.group);
  }

  /** Parks the visitor in front of the wall, looking at it. */
  enter(player: PlayerController): void {
    const viewpoint = this.centre.clone().addScaledVector(this.front(), VIEWPOINT_DISTANCE);
    viewpoint.y = this.options.ground.heightAt(viewpoint.x, viewpoint.z) + PLAYER_EYE_HEIGHT;
    player.teleport(viewpoint, this.options.rotationY);
  }

  interact(): void {
    this.originals = !this.originals;
    if (this.options.reducedMotion()) {
      this.applyTitles();
    } else {
      this.flip = { elapsed: 0 };
    }
  }

  exit(): void {
    this.originals = false;
    this.flip = null;
    this.applyTitles();
    this.cards.forEach((card) => card.mesh.scale.set(1, 1, 1));
  }

  update(dt: number): void {
    if (!this.flip) {
      return;
    }

    this.flip.elapsed += dt;
    const t = Math.min(this.flip.elapsed / FLIP_SECONDS, 1);
    // Squash to nothing at the halfway point, swap, then grow back.
    const width = Math.abs(1 - 2 * t);
    if (t >= 0.5) {
      this.applyTitles();
    }
    this.cards.forEach((card) => card.mesh.scale.set(Math.max(width, 0.01), 1, 1));
    if (t >= 1) {
      this.flip = null;
    }
  }

  dispose(): void {
    this.cards.forEach((card) => {
      card.slop.map?.dispose();
      card.slop.dispose();
      card.original.map?.dispose();
      card.original.dispose();
    });
    this.cards = [];
    disposeObject3D(this.group);
    this.group.clear();
  }

  private applyTitles(): void {
    this.cards.forEach((card) => {
      card.mesh.material = this.originals ? card.original : card.slop;
    });
  }
}

/** A "video thumbnail" with its title, drawn on a canvas; plain colour where 2D canvas is absent. */
function cardMaterial(title: string, color: string, index: number): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: new Color(color) });
  }

  context.fillStyle = '#f4f4f4';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Thumbnail area: a shaded block with a play triangle, varied a little per card.
  context.fillStyle = `hsl(${(index * 67) % 360} 35% 45%)`;
  context.fillRect(16, 16, CANVAS_WIDTH - 32, 200);
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.beginPath();
  context.moveTo(CANVAS_WIDTH / 2 - 24, 80);
  context.lineTo(CANVAS_WIDTH / 2 + 32, 116);
  context.lineTo(CANVAS_WIDTH / 2 - 24, 152);
  context.closePath();
  context.fill();

  context.fillStyle = color;
  context.fillRect(16, 228, 8, 100);
  context.fillStyle = '#16202a';
  context.font = 'bold 34px system-ui, sans-serif';
  context.textBaseline = 'top';
  wrapText(context, title, 40, 232, CANVAS_WIDTH - 56, 40);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: texture });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  context.fillText(line, x, y);
}

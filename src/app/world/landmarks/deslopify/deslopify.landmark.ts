import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { WorldContext } from '@engine/world-object';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { LandmarkShape } from '../base/landmark';
import { PortalLandmark } from '../base/portal.landmark';

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

/** Where the wall stands relative to the portal (local frame, before rotation). */
const WALL_OFFSET_X = 5.5;
const WALL_OFFSET_Z = 0.5;
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

/**
 * Deslopify's portal plus its in-world demo (IMPLEMENTATION_PLAN.md §5): a wall of video cards
 * showing mistranslated titles. Entering the demo parks the visitor in front of the wall; `E`
 * swaps the titles for the originals, exactly what the extension does on YouTube.
 */
export class DeslopifyLandmark extends PortalLandmark {
  override readonly demoHint = 'E: Originaltitel ein- und ausblenden · Esc: Demo verlassen';

  private originals = false;
  private cards: { mesh: Mesh; slop: MeshBasicMaterial; original: MeshBasicMaterial }[] = [];
  private flip: { elapsed: number } | null = null;
  private wallCentre = new Vector3();

  get showingOriginals(): boolean {
    return this.originals;
  }

  protected override describe(): LandmarkShape {
    const portal = super.describe();
    const wallWidth = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP);
    const corners = [-wallWidth / 2, wallWidth / 2].flatMap((x) =>
      [-0.6, 0.6].map((z) => this.toWorld(WALL_OFFSET_X + x, 0, WALL_OFFSET_Z + z)),
    );
    const wall = this.toWorld(WALL_OFFSET_X, 0, WALL_OFFSET_Z);

    return {
      colliders: [
        ...portal.colliders,
        {
          kind: 'aabb',
          minX: Math.min(...corners.map((c) => c.x)),
          maxX: Math.max(...corners.map((c) => c.x)),
          minZ: Math.min(...corners.map((c) => c.z)),
          maxZ: Math.max(...corners.map((c) => c.z)),
        },
      ],
      interactables: [
        ...portal.interactables,
        {
          id: `${this.id}:demo`,
          position: wall,
          radius: INTERACT_RADIUS,
          prompt: 'Deslopify ausprobieren',
          onInteract: () => this.onDemo?.(this),
        },
      ],
    };
  }

  protected override build(ctx: WorldContext): void {
    super.build(ctx);

    const wallWidth = EXAMPLE_VIDEOS.length * (CARD_WIDTH + CARD_GAP) + CARD_GAP;
    const backing = new Mesh(
      new BoxGeometry(wallWidth, CARD_HEIGHT + 2 * CARD_GAP + 0.5, WALL_DEPTH),
      new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 }),
    );
    backing.name = 'video-wall';
    backing.position.set(WALL_OFFSET_X, WALL_CENTRE_Y, WALL_OFFSET_Z);
    backing.castShadow = ctx.quality.shadows;
    this.group.add(backing);
    this.wallCentre = this.toWorld(WALL_OFFSET_X, 0, WALL_OFFSET_Z);

    const accent = new Color(this.project.theme.primary);
    EXAMPLE_VIDEOS.forEach((video, index) => {
      const slop = cardMaterial(video.slop, `#${accent.getHexString()}`, index);
      const original = cardMaterial(video.original, '#1b7f4f', index);
      const mesh = new Mesh(new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), slop);
      mesh.name = `card:${index}`;
      const x = WALL_OFFSET_X + (index - (EXAMPLE_VIDEOS.length - 1) / 2) * (CARD_WIDTH + CARD_GAP);
      mesh.position.set(x, WALL_CENTRE_Y + 0.15, WALL_OFFSET_Z + WALL_DEPTH / 2 + 0.01);
      this.group.add(mesh);
      this.cards.push({ mesh, slop, original });
    });
  }

  override enter(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    // Stand in front of the wall, looking at it: the wall faces the landmark's front.
    const viewpoint = this.wallCentre.clone().addScaledVector(this.front(), VIEWPOINT_DISTANCE);
    viewpoint.y = ctx.player.position.y - PLAYER_EYE_HEIGHT + PLAYER_EYE_HEIGHT;
    ctx.player.teleport(viewpoint, this.rotationY);
    ctx.player.pitch = 0;
  }

  override interact(): void {
    this.originals = !this.originals;
    if (this.reducedMotion()) {
      this.applyTitles();
    } else {
      this.flip = { elapsed: 0 };
    }
  }

  override exit(): void {
    this.originals = false;
    this.flip = null;
    this.applyTitles();
    this.cards.forEach((card) => card.mesh.scale.set(1, 1, 1));
  }

  override update(dt: number, ctx: WorldContext): void {
    super.update(dt, ctx);
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

  override dispose(): void {
    this.cards.forEach((card) => {
      card.slop.map?.dispose();
      card.slop.dispose();
      card.original.map?.dispose();
      card.original.dispose();
    });
    this.cards = [];
    super.dispose();
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

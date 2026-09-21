import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { disposeObject3D } from '@engine/dispose';
import { Interactable } from '@engine/interaction/interactable';
import { Collider, HeightField } from '@engine/player/collision';
import { WorldContext, WorldObject } from '@engine/world-object';
import { ABOUT } from '@content/about';
import type { Mood } from '../environments/mood';
import { Motes } from '../environments/motes';
import { createLabel } from '../landmarks/base/label';
import { rotatedAabb } from '../environments/props/footprint';
import { wrapLine } from '../environments/props/terminal';
import { seededRandom, between } from '../environments/random';
import { withAtmosphere } from '../environments/shaders/atmosphere';
import { SharedUniforms } from '../environments/shaders/shared-uniforms';
import { withWind } from '../environments/shaders/wind';

/**
 * Where everything in the camp stands, as XZ offsets from the spawn (which faces −Z).
 *
 * The whole camp stays out of the bearing fan the hub's portals stand in (`FRONT_ARC`, widened by
 * a portal's half-width at the near ring and the visibility margin): seen from the spawn, no camp
 * collider can cover a portal, today's five or the nine the fan is sized for, and no walk from the
 * spawn towards a portal crosses one. `portfolio-placement.spec.ts` proves both. Left of the spawn
 * the fire, the pinboard and the workbench; right of it the contact obelisk and the controls board.
 */
export const CAMP = {
  fire: { x: -4.4, z: -0.6 },
  pinboard: { x: -7.0, z: -1.5 },
  workbench: { x: -6.4, z: 1.8 },
  obelisk: { x: 5.6, z: -1.6 },
  controls: { x: 6.6, z: 1.6 },
  /**
   * Kept free for T10d's availability sign; the workbench's left half is kept free for its tool
   * rack. Nothing in this task stands here, and the grass is already cleared around it.
   */
  reserved: { x: 7.6, z: -0.8 },
} as const;

/** The camp's two sides, where the grass gives way to trodden ground. */
const CLEARINGS = [
  { x: -5.9, z: 0.1, radius: 3.2 },
  { x: 6.6, z: 0, radius: 2.7 },
] as const;

/** What the HUD offers at the obelisk: "E: Kontakt und Lebenslauf". */
export const CONTACT_PROMPT = 'Kontakt und Lebenslauf';

const FIRE_RING_RADIUS = 0.8;
const OBELISK_RADIUS = 0.5;
const OBELISK_HEIGHT = 2.7;
const OBELISK_INTERACT_RADIUS = 3;
/** The shaft's radius at its foot and its top; four sides, so a face stands `cos 45°` of it out. */
const OBELISK_FOOT = OBELISK_RADIUS - 0.08;
const OBELISK_TOP = 0.22;
/** How far a face leans back from vertical as the shaft tapers. */
const OBELISK_FACE_TILT = Math.atan(((OBELISK_FOOT - OBELISK_TOP) * Math.SQRT1_2) / OBELISK_HEIGHT);

/** Distance from the obelisk's axis to the middle of a face at height `y`. */
function obeliskFace(y: number): number {
  return (OBELISK_FOOT + ((OBELISK_TOP - OBELISK_FOOT) * y) / OBELISK_HEIGHT) * Math.SQRT1_2;
}
const PINBOARD = { width: 2.2, height: 1.375, centre: 1.75 } as const;
const CONTROLS = { width: 1.8, height: 1.125, centre: 1.45 } as const;
const BOARD_DEPTH = 0.1;
const BENCH = { width: 1.8, depth: 0.7, height: 0.9 } as const;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 640;
const MARGIN = 64;
const PAPER = '#efe6d2';
const INK = '#2b2118';
const MUTED = '#5c4a38';

/** The controls, as the canvas's own label and the input service spell them. */
const CONTROL_LINES = [
  'W A S D – gehen',
  'Umschalt – laufen · Leertaste – springen',
  'Maus oder ← → – umsehen',
  'E – benutzen · V – Ansicht wechseln',
  'M – Menü · Esc – zurück',
] as const;

export interface HomeBaseOptions {
  readonly ground: HeightField;
  /** The start world's light: the camp's shaders read their own copy of its shared uniforms. */
  readonly mood: Mood;
  readonly reducedMotion: () => boolean;
  /** Where the camp stands; the offsets above are measured from here. */
  readonly origin?: Vector3;
  /** Opens the contact dialog. Without it the obelisk offers nothing, since a dead prompt lies. */
  readonly onContact?: () => void;
}

interface Placed {
  readonly position: Vector3;
  /** 0 faces +Z, as the exhibits and the terminal count it. */
  readonly rotationY: number;
}

/**
 * Jamie's camp at the spawn of the start world: a campfire, a pinboard with his name and role, a
 * workbench, a controls board and a contact obelisk that opens the contact dialog. Every string
 * about Jamie comes from `@content/about`, the one source the `/projects` header reads too.
 *
 * Fixed counts, colliders placed in the constructor, nothing scaled by `propDensity` except the
 * fire's embers. The flames sway in the shared wind and the embers drift on the shared clock, so
 * reduced motion stills both with everything else.
 */
export class HomeBase implements WorldObject {
  readonly id = 'home-base';
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];
  /** Ground the environment keeps free of grass and flowers. */
  readonly clearings: readonly {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
  }[];

  private readonly group = new Group();
  private readonly shared: SharedUniforms;
  private readonly embers: Motes;
  private readonly fire: Placed;
  private readonly pinboard: Placed;
  private readonly workbench: Placed;
  private readonly obelisk: Placed;
  private readonly controls: Placed;

  constructor(private readonly options: HomeBaseOptions) {
    const origin = options.origin ?? new Vector3();
    const at = ({ x, z }: { x: number; z: number }) => {
      const position = new Vector3(origin.x + x, 0, origin.z + z);
      position.y = options.ground.heightAt(position.x, position.z);
      return position;
    };
    // Boards turn to face the spawn, so they read from where the visitor arrives.
    const facingOrigin = (position: Vector3) =>
      Math.atan2(origin.x - position.x, origin.z - position.z);
    const place = (spot: { x: number; z: number }, rotationY?: number): Placed => {
      const position = at(spot);
      return { position, rotationY: rotationY ?? facingOrigin(position) };
    };

    this.fire = place(CAMP.fire, 0);
    this.pinboard = place(CAMP.pinboard);
    this.obelisk = place(CAMP.obelisk);
    this.controls = place(CAMP.controls);
    // The bench's working side faces the fire.
    const bench = at(CAMP.workbench);
    const fire = this.fire.position;
    this.workbench = {
      position: bench,
      rotationY: Math.atan2(fire.x - bench.x, fire.z - bench.z),
    };

    this.colliders = [
      { kind: 'cylinder', x: fire.x, z: fire.z, radius: FIRE_RING_RADIUS },
      rotatedAabb(
        this.pinboard.position,
        PINBOARD.width / 2 + 0.05,
        BOARD_DEPTH,
        this.pinboard.rotationY,
      ),
      rotatedAabb(bench, BENCH.width / 2, BENCH.depth / 2, this.workbench.rotationY),
      {
        kind: 'cylinder',
        x: this.obelisk.position.x,
        z: this.obelisk.position.z,
        radius: OBELISK_RADIUS,
      },
      rotatedAabb(
        this.controls.position,
        CONTROLS.width / 2 + 0.05,
        BOARD_DEPTH,
        this.controls.rotationY,
      ),
    ];

    const onContact = options.onContact;
    this.interactables = onContact
      ? [
          {
            id: 'home-base:contact',
            position: this.obelisk.position.clone(),
            radius: OBELISK_INTERACT_RADIUS,
            prompt: CONTACT_PROMPT,
            onInteract: () => onContact(),
          },
        ]
      : [];

    this.clearings = CLEARINGS.map(({ x, z, radius }) => ({
      x: origin.x + x,
      z: origin.z + z,
      radius,
    }));

    this.shared = new SharedUniforms(options.mood);
    this.embers = new Motes({
      shared: this.shared,
      seed: 401,
      count: 40,
      area: { x: fire.x, z: fire.z, radius: 0.3, minY: 0.35, maxY: 2.1 },
      heightAt: (x, z) => options.ground.heightAt(x, z),
      followCamera: false,
      colour: 0xffa54a,
      size: 0.05,
      glow: 2.2,
      directGlow: 1.3,
      drift: 0.3,
      flicker: 0.85,
    });
    this.group.name = this.id;
  }

  /** Where the obelisk stands; the e2e walk and the placement specs read it. */
  get contactPosition(): Vector3 {
    return this.obelisk.position.clone();
  }

  init(ctx: WorldContext): void {
    const shadows = ctx.quality.shadows;
    const stone = withAtmosphere(
      new MeshStandardMaterial({ color: 0x8e8778, roughness: 0.95, flatShading: true }),
      this.shared,
    );
    const wood = withAtmosphere(
      new MeshStandardMaterial({ color: 0x7a5234, roughness: 0.9 }),
      this.shared,
    );
    const darkWood = withAtmosphere(
      new MeshStandardMaterial({ color: 0x4f3421, roughness: 0.95 }),
      this.shared,
    );

    this.group.add(
      this.buildFire(stone, darkWood),
      this.buildPinboard(wood),
      this.buildWorkbench(wood, darkWood),
      this.buildObelisk(stone),
      this.buildControls(wood),
    );
    this.group.traverse((object) => {
      // Sheets and flames neither cast nor catch shadows: they are paper and light.
      if (
        object instanceof Mesh &&
        !(object.material instanceof MeshBasicMaterial) &&
        !object.material.transparent
      ) {
        object.castShadow = shadows;
        object.receiveShadow = shadows;
      }
    });
    ctx.scene.add(this.group);
    this.embers.init(ctx);
  }

  update(dt: number, ctx: WorldContext): void {
    this.shared.update(dt, ctx.player.position, this.options.reducedMotion());
  }

  dispose(): void {
    this.embers.dispose();
    // Takes every canvas texture with it: `disposeObject3D` releases each map a material holds.
    disposeObject3D(this.group);
    this.group.clear();
  }

  private placedGroup(name: string, placed: Placed): Group {
    const group = new Group();
    group.name = `${this.id}:${name}`;
    group.position.copy(placed.position);
    group.rotation.y = placed.rotationY;
    return group;
  }

  private buildFire(stone: MeshStandardMaterial, darkWood: MeshStandardMaterial): Group {
    const group = this.placedGroup('fire', this.fire);
    const random = seededRandom(402);

    // A ring of stones, each a slightly different lump.
    const stones = 9;
    for (let i = 0; i < stones; i++) {
      const angle = (i / stones) * Math.PI * 2 + between(random, -0.12, 0.12);
      const size = between(random, 0.17, 0.24);
      const lump = new Mesh(new DodecahedronGeometry(size, 0), stone);
      lump.position.set(
        Math.cos(angle) * (FIRE_RING_RADIUS - 0.12),
        size * 0.55,
        Math.sin(angle) * (FIRE_RING_RADIUS - 0.12),
      );
      lump.rotation.set(random() * Math.PI, random() * Math.PI, 0);
      lump.scale.y = 0.7;
      group.add(lump);
    }

    // Three logs leaning into a cone.
    for (let i = 0; i < 3; i++) {
      const log = new Mesh(new CylinderGeometry(0.07, 0.08, 0.95, 6), darkWood);
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      log.position.set(Math.cos(angle) * 0.2, 0.28, Math.sin(angle) * 0.2);
      log.rotation.set(0, -angle, 0);
      log.rotateZ(0.95);
      group.add(log);
    }

    // The embers' bed and the flames glow on their own; the flames sway in the shared wind.
    const bed = new Mesh(
      new CylinderGeometry(0.34, 0.4, 0.08, 10),
      new MeshStandardMaterial({ color: 0x1a0f08, emissive: 0xff5a1f, emissiveIntensity: 1.2 }),
    );
    bed.position.y = 0.04;
    group.add(bed);
    const flameShapes = [
      { radius: 0.24, height: 0.95, colour: 0xff7a1a, x: 0, z: 0 },
      { radius: 0.16, height: 0.7, colour: 0xffb238, x: 0.1, z: 0.06 },
      { radius: 0.14, height: 0.6, colour: 0xffc85a, x: -0.09, z: -0.05 },
    ];
    for (const shape of flameShapes) {
      const material = withWind(
        new MeshStandardMaterial({
          color: 0x000000,
          emissive: shape.colour,
          emissiveIntensity: 2.4,
          roughness: 1,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
        this.shared,
        { amplitude: 0.35, height: shape.height },
      );
      const flame = new Mesh(new ConeGeometry(shape.radius, shape.height, 7, 1, true), material);
      flame.name = `${this.id}:flame`;
      flame.position.set(shape.x, 0.08 + shape.height / 2, shape.z);
      group.add(flame);
    }
    return group;
  }

  private buildPinboard(wood: MeshStandardMaterial): Group {
    const group = this.placedGroup('pinboard', this.pinboard);
    this.addPosts(group, wood, PINBOARD.width, PINBOARD.centre + PINBOARD.height / 2);
    const frame = new Mesh(
      new BoxGeometry(PINBOARD.width + 0.12, PINBOARD.height + 0.12, BOARD_DEPTH),
      wood,
    );
    frame.position.y = PINBOARD.centre;
    group.add(frame);

    const { profile } = ABOUT;
    const sheet = boardSheet(
      [
        { text: profile.name, font: 'bold 96px system-ui, sans-serif', colour: INK, gap: 110 },
        { text: profile.role, font: '44px system-ui, sans-serif', colour: INK, gap: 58 },
        {
          text: 'Kontakt und Lebenslauf: am Obelisken gegenüber',
          font: '34px system-ui, sans-serif',
          colour: MUTED,
          gap: 50,
          spaceBefore: 40,
        },
      ],
      PINBOARD.width,
      PINBOARD.height,
    );
    if (sheet) {
      sheet.position.set(0, PINBOARD.centre, BOARD_DEPTH / 2 + 0.005);
      sheet.name = `${this.id}:pinboard-sheet`;
      group.add(sheet);
    }
    return group;
  }

  private buildControls(wood: MeshStandardMaterial): Group {
    const group = this.placedGroup('controls', this.controls);
    this.addPosts(group, wood, CONTROLS.width, CONTROLS.centre + CONTROLS.height / 2);
    const frame = new Mesh(
      new BoxGeometry(CONTROLS.width + 0.1, CONTROLS.height + 0.1, BOARD_DEPTH),
      wood,
    );
    frame.position.y = CONTROLS.centre;
    group.add(frame);

    const sheet = boardSheet(
      [
        { text: 'Steuerung', font: 'bold 76px system-ui, sans-serif', colour: INK, gap: 96 },
        ...CONTROL_LINES.map((text) => ({
          text,
          font: '44px system-ui, sans-serif',
          colour: INK,
          gap: 64,
        })),
      ],
      CONTROLS.width,
      CONTROLS.height,
    );
    if (sheet) {
      sheet.position.set(0, CONTROLS.centre, BOARD_DEPTH / 2 + 0.005);
      sheet.name = `${this.id}:controls-sheet`;
      group.add(sheet);
    }
    return group;
  }

  private buildWorkbench(wood: MeshStandardMaterial, darkWood: MeshStandardMaterial): Group {
    const group = this.placedGroup('workbench', this.workbench);
    const top = new Mesh(new BoxGeometry(BENCH.width, 0.08, BENCH.depth), wood);
    top.position.y = BENCH.height;
    group.add(top);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.08, BENCH.height, 0.08), darkWood);
        leg.position.set(
          x * (BENCH.width / 2 - 0.08),
          BENCH.height / 2,
          z * (BENCH.depth / 2 - 0.08),
        );
        group.add(leg);
      }
    }
    const shelf = new Mesh(new BoxGeometry(BENCH.width - 0.16, 0.04, BENCH.depth - 0.16), darkWood);
    shelf.position.y = 0.25;
    group.add(shelf);
    // A toolbox on the right half; the left half stays free for T10d's tool rack.
    const box = new Mesh(
      new BoxGeometry(0.5, 0.22, 0.28),
      new MeshStandardMaterial({ color: 0xa4382a, roughness: 0.6, metalness: 0.2 }),
    );
    box.position.set(BENCH.width / 2 - 0.4, BENCH.height + 0.15, 0);
    group.add(box);
    return group;
  }

  private buildObelisk(stone: MeshStandardMaterial): Group {
    const group = this.placedGroup('obelisk', this.obelisk);
    // Four-sided and tapering, turned so one face looks at the spawn.
    const shaft = new Mesh(
      new CylinderGeometry(OBELISK_TOP, OBELISK_FOOT, OBELISK_HEIGHT, 4, 1),
      stone,
    );
    shaft.rotation.y = Math.PI / 4;
    shaft.position.y = OBELISK_HEIGHT / 2;
    group.add(shaft);
    const cap = new Mesh(new ConeGeometry(0.31, 0.3, 4), stone);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = OBELISK_HEIGHT + 0.15;
    group.add(cap);

    // A glowing inlay says the stone can be used, in the colour of the HUD's prompt. It lies flat
    // on the face that looks at the spawn.
    const inlay = new Mesh(new PlaneGeometry(0.1, 1.1), new MeshBasicMaterial({ color: 0x86e0cf }));
    inlay.position.set(0, 1.25, obeliskFace(1.25) + 0.006);
    inlay.rotation.x = -OBELISK_FACE_TILT;
    group.add(inlay);

    // Named like a portal: a tag above the stone, readable from where the visitor arrives.
    const tag = createLabel('Kontakt', '#2c3a40');
    if (tag) {
      tag.scale.setScalar(0.55);
      tag.position.set(0, OBELISK_HEIGHT + 0.65, 0);
      tag.name = `${this.id}:obelisk-tag`;
      group.add(tag);
    }
    return group;
  }

  private addPosts(group: Group, wood: MeshStandardMaterial, width: number, height: number): void {
    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.1, height, 0.1), wood);
      post.position.set(side * (width / 2 + 0.02), height / 2, -BOARD_DEPTH);
      group.add(post);
    }
  }
}

interface SheetLine {
  readonly text: string;
  readonly font: string;
  readonly colour: string;
  /** Pixels from this line's baseline to the next. */
  readonly gap: number;
  readonly spaceBefore?: number;
}

/**
 * A sheet of paper `width` × `height` metres with `lines` on it, drawn once into a canvas texture.
 * `null` without a 2-D context (jsdom), so the board simply stands blank there.
 */
function boardSheet(lines: readonly SheetLine[], width: number, height: number): Mesh | null {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }
  if (!context) {
    return null;
  }

  context.fillStyle = PAPER;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  const room = CANVAS_WIDTH - MARGIN * 2;
  let y = MARGIN + 60;
  for (const line of lines) {
    context.font = line.font;
    context.fillStyle = line.colour;
    y += line.spaceBefore ?? 0;
    for (const part of wrapLine(line.text, room, (text) => context.measureText(text).width)) {
      context.fillText(part, MARGIN, y, room);
      y += line.gap;
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture }));
}

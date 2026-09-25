import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { InputAction, InputActionSource } from '@engine/input.service';
import { disposeObject3D } from '@engine/dispose';
import { Collider, HeightField } from '@engine/player/collision';
import { PLAYER_EYE_HEIGHT, PlayerController } from '@engine/player/player-controller';
import { Interactable } from '@engine/interaction/interactable';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { Project } from '@content/project.model';
import {
  formatCommitActivityLines,
  formatInteger,
  formatLanguageLine,
  formatOptionalDate,
  formatReleaseLine,
  REPOSITORY_LABELS,
  repositoryCommitActivity,
  repositoryLanguages,
  repositoryReleases,
} from '@content/repository-data';
import { rotatedAabb } from './footprint';
import { bakeGeometry, borrowModels } from '../model-geometry';
import { createLabel } from '../../landmarks/base/label';
import type { HazedCopies } from '../shaders/hazed-copies';

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 640;
const MARGIN = 48;
const TITLE_FONT = 'bold 54px system-ui, sans-serif';
const BODY_FONT = '36px system-ui, sans-serif';
const SMALL_FONT = '26px system-ui, sans-serif';
const LINE_HEIGHT = 48;
const BODY_TOP = 176;
const FOOTER_Y = CANVAS_HEIGHT - 32;
const BACKGROUND = '#0f171d';
const INK = '#d8f3ec';
const ACCENT = '#86e0cf';
const MUTED = '#8fa9b1';

const SCREEN_WIDTH = 2.4;
const SCREEN_HEIGHT = 1.5;
/**
 * High, like an information board: in the third-person view the camera hangs 0.35 m above the
 * reader's eyes and looks past their head, so a screen at eye height would sit behind the body.
 * With its lower edge at 2.2 m and the reader's view tipped up by `READING_PITCH`, the whole screen
 * clears the head in that view and still fits the first-person one.
 */
const SCREEN_CENTRE = 2.95;
const CASE_DEPTH = 0.3;
const CASE_WIDTH = SCREEN_WIDTH + 0.2;
const CASE_HEIGHT = SCREEN_HEIGHT + 0.2;
const POST_WIDTH = 0.2;
const INTERACT_RADIUS = 3;
/** Where the visitor stands to read, in front of the screen. */
const READING_DISTANCE = 2.3;
/** Radians the reader looks up while reading; positive pitch looks up. */
const READING_PITCH = 0.2;
/**
 * The jungle stele's stone, modelled in Blender (scripts/blender/models/stele.py) to the
 * procedural slab's envelope, so the screen panel and the plank label sit on it unchanged.
 */
export const STELE_MODEL = 'assets/models/stele.glb';
/**
 * The Plaza's newsstand kiosk (scripts/blender/models/plaza_terminal.py), built around the default
 * screen: its empty `screen` sits where the screen is drawn.
 */
export const PLAZA_TERMINAL_MODEL = 'assets/models/plaza-terminal.glb';

/**
 * The kiosk's counter is 2.9 × 0.5 m and its stone feet reach ±1.54 m, so the Plaza's terminal
 * blocks a wider, deeper box than the default screen on its post.
 */
const PLAZA_COLLIDER_WIDTH = 3.1;
const PLAZA_COLLIDER_DEPTH = 0.65;

const JUNGLE_SCREEN_WIDTH = 1.6;
const JUNGLE_SCREEN_HEIGHT = 1;
const JUNGLE_CASE_WIDTH = 1.69;
const JUNGLE_CASE_HEIGHT = 1.09;
const JUNGLE_CASE_DEPTH = 0.14;
const JUNGLE_SCREEN_CENTRE = 2.1;
const JUNGLE_SLAB_HEIGHT = 2.75;
const JUNGLE_SLAB_WIDTH = 2.1;
const JUNGLE_SLAB_DEPTH = 0.56;
const JUNGLE_SLAB_RADIUS_TOP = 1.45;
const JUNGLE_SLAB_RADIUS_BOTTOM = 1.5;
const JUNGLE_TILT = -Math.PI / 15;
const JUNGLE_BODY_FONT = '44px "IBM Plex Sans", system-ui, sans-serif';
const JUNGLE_TITLE_FONT = '600 54px "IBM Plex Sans", system-ui, sans-serif';
const JUNGLE_FOOTER_FONT = '500 26px "IBM Plex Mono", ui-monospace, monospace';
const JUNGLE_BACKGROUND = '#141b17';
const JUNGLE_INK = '#f4efe4';
const JUNGLE_ACCENT = '#f4e6c8';
const JUNGLE_MUTED = '#b7ad91';
const JUNGLE_WOOD = 0x5a3d27;
const JUNGLE_MOSS = 0x3b5a2f;
const JUNGLE_MAX_LINES = 5;
const JUNGLE_DOT_SIZE = 8;
const JUNGLE_DOT_GAP = 12;
const JUNGLE_KEYCAP_HEIGHT = 36;
const JUNGLE_KEYCAP_RADIUS = 6;
const JUNGLE_KEYCAP_PADDING = 10;
const JUNGLE_KEYCAP_LABEL_GAP = 8;
const JUNGLE_FOOTER_GAP = 18;
/** Entries per page: a longer section — many languages or releases — runs on over more pages. */
export const TERMINAL_LINES_PER_PAGE = 8;

/** What the HUD offers at the terminal, and what it offers while the terminal holds the controls. */
export const TERMINAL_PROMPT = 'Terminal bedienen';
export const TERMINAL_RELEASE_PROMPT = 'Terminal verlassen';

/** How the terminal is dressed: a screen on a post, the jungle's stele, or the Plaza's kiosk. */
export type TerminalSkin = 'default' | 'jungle' | 'plaza';

export interface TerminalPage {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface TerminalOptions {
  readonly id: string;
  readonly position: Vector3;
  /** Which way the screen faces, with the exhibit's convention: 0 faces +Z. */
  readonly rotationY?: number;
  readonly ground: HeightField;
  readonly project: Project;
  readonly skin?: TerminalSkin;
  /** The controls the terminal takes while it is used; headless specs may leave it out. */
  readonly input?: InputActionSource;
  /** Hazes the stele's and the kiosk's materials into the environment's air; without it they stay plain. */
  readonly haze?: HazedCopies;
}

/**
 * The terminal's pages, built from the project and its synced metrics alone. A missing or zero
 * value is left out, as the project page leaves it out, and every sentence comes from the formatter
 * the project page uses, so the world and the page can never word one fact differently. Pure — no
 * Angular, no DOM, no Three.js — which is what lets a unit test read what no jsdom canvas can show.
 */
export function buildTerminalPages(project: Project): readonly TerminalPage[] {
  const pages: TerminalPage[] = [
    {
      title: REPOSITORY_LABELS.project,
      lines: [project.title, ...(project.summary ? [project.summary] : []), project.repoUrl],
    },
  ];
  const section = (title: string, lines: readonly string[]) => {
    for (let start = 0; start < lines.length; start += TERMINAL_LINES_PER_PAGE) {
      pages.push({ title, lines: lines.slice(start, start + TERMINAL_LINES_PER_PAGE) });
    }
  };

  const languages = repositoryLanguages(project);
  if (languages.length > 0) {
    section(REPOSITORY_LABELS.languages, languages.map(formatLanguageLine));
  }

  const activity = repositoryCommitActivity(project);
  if (activity && activity.total > 0) {
    section(REPOSITORY_LABELS.commits, formatCommitActivityLines(activity));
  }

  const releases = repositoryReleases(project);
  if (releases.length > 0) {
    section(REPOSITORY_LABELS.releases, releases.map(formatReleaseLine));
  }

  const metrics: string[] = [];
  const count = (label: string, value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value) && value > 0) {
      metrics.push(`${label}: ${formatInteger(value)}`);
    }
  };
  const date = (label: string, value: string | undefined) => {
    const formatted = formatOptionalDate(value);
    if (formatted !== undefined) {
      metrics.push(`${label}: ${formatted}`);
    }
  };
  count(REPOSITORY_LABELS.stars, project.stars);
  count(REPOSITORY_LABELS.forks, project.forks);
  count(REPOSITORY_LABELS.openIssues, project.openIssues);
  if (project.license) {
    metrics.push(`${REPOSITORY_LABELS.license}: ${project.license}`);
  }
  date(REPOSITORY_LABELS.created, project.createdAt);
  date(REPOSITORY_LABELS.firstCommit, project.firstCommitAt);
  date(REPOSITORY_LABELS.lastPush, project.pushedAt);
  section(REPOSITORY_LABELS.metrics, metrics);

  return pages;
}

/** The line under every page: where the visitor is, and how to go on or leave. */
export function terminalFooter(page: number, pages: number): string {
  return `Seite ${page + 1} von ${pages} · ↑ ↓ blättern · E oder Esc: verlassen`;
}

/**
 * Splits `text` into lines no wider than `maxWidth` by `measure`, breaking at spaces. A single word
 * wider than a line stands alone, and `fillText`'s own `maxWidth` squeezes it.
 */
export function wrapLine(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter((part) => part.length > 0)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * A screen on a post that prints the facts of the world it stands in. `E` takes the controls, the
 * visitor steps square in front of the screen, the up and down arrows turn the page, and `E` or
 * `Escape` hands the controls back — no text input, which would fight pointer lock. The screen is a
 * `CanvasTexture` drawn once per page change, never per frame.
 */
export class Terminal implements WorldObject {
  readonly id: string;
  readonly position: Vector3;
  readonly colliders: readonly Collider[];
  readonly interactables: readonly Interactable[];
  readonly pages: readonly TerminalPage[];
  readonly skin: TerminalSkin;
  /** Where the visitor's eyes go while reading: square in front of the screen. */
  readonly reading: Vector3;

  private readonly group = new Group();
  private readonly options: TerminalOptions;
  private readonly stopCapture: () => void;
  private readonly stopActions: () => void;
  private player: PlayerController | null = null;
  /** The procedural slab and moss edges, until the stele model replaces them. */
  private steleProxy: Mesh[] = [];
  private steleModel: Group | null = null;
  /** The default case and post, until the Plaza's kiosk model replaces them. */
  private caseProxy: Mesh[] = [];
  private assets: WorldContext['assets'] | null = null;
  private disposed = false;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;
  private activeValue = false;
  private pageIndexValue = 0;

  constructor(options: TerminalOptions) {
    this.options = options;
    this.id = options.id;
    this.skin = options.skin ?? 'default';
    this.pages = buildTerminalPages(options.project);
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = options.rotationY ?? 0;
    const dimensions = terminalDimensions(this.skin);
    const rotationY = options.rotationY ?? 0;
    this.reading = this.position
      .clone()
      .add(
        new Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)).multiplyScalar(
          dimensions.readingDistance,
        ),
      );
    this.reading.y = options.ground.heightAt(this.reading.x, this.reading.z) + PLAYER_EYE_HEIGHT;
    this.colliders = [
      rotatedAabb(
        this.position,
        dimensions.colliderWidth / 2,
        dimensions.colliderDepth / 2,
        options.rotationY ?? 0,
      ),
    ];
    this.interactables = [
      {
        id: `${this.id}:use`,
        position: this.position.clone(),
        radius: INTERACT_RADIUS,
        prompt: TERMINAL_PROMPT,
        onInteract: () => this.open(),
      },
    ];
    this.stopCapture =
      options.input?.addCaptureListener((captured) => {
        if (!captured) {
          this.activeValue = false;
        }
      }) ?? noop;
    this.stopActions = options.input?.addActionListener((action) => this.onAction(action)) ?? noop;
  }

  /** Whether the terminal holds the controls. */
  get active(): boolean {
    return this.activeValue;
  }

  get pageIndex(): number {
    return this.pageIndexValue;
  }

  init(ctx: WorldContext): void {
    this.player = ctx.player;
    const dimensions = terminalDimensions(this.skin);
    let screenParent = this.group;
    if (this.skin === 'jungle') {
      screenParent = this.createJungleStele(ctx, dimensions);
    } else {
      const casing = new MeshStandardMaterial({
        color: 0x26323a,
        metalness: 0.25,
        roughness: 0.6,
      });
      const body = new Mesh(
        new BoxGeometry(dimensions.caseWidth, dimensions.caseHeight, dimensions.caseDepth),
        casing,
      );
      body.name = `${this.id}:body`;
      body.position.y = dimensions.screenCentre;
      body.castShadow = ctx.quality.shadows;
      const postHeight = dimensions.screenCentre - dimensions.caseHeight / 2;
      const post = new Mesh(
        new BoxGeometry(POST_WIDTH, postHeight, dimensions.caseDepth * 0.8),
        casing,
      );
      post.name = `${this.id}:post`;
      post.position.y = postHeight / 2;
      post.castShadow = ctx.quality.shadows;
      this.group.add(body, post);
      if (this.skin === 'plaza') {
        this.caseProxy = [body, post];
        this.loadKiosk(ctx);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    this.canvasContext = contextFor(canvas);
    // Without a 2-D context (jsdom, or a browser that refuses one) the screen stays dark and the
    // terminal still works: the pages turn, only nothing is drawn.
    const material = new MeshBasicMaterial({
      color: this.skin === 'jungle' ? JUNGLE_BACKGROUND : BACKGROUND,
    });
    if (this.canvasContext) {
      this.texture = new CanvasTexture(canvas);
      this.texture.colorSpace = SRGBColorSpace;
      material.map = this.texture;
      material.color.set(0xffffff);
      this.redraw();
      if (this.skin === 'jungle') {
        void document.fonts?.load(JUNGLE_BODY_FONT).then(
          () => this.redraw(),
          () => undefined,
        );
      }
    }
    const screen = new Mesh(
      new PlaneGeometry(dimensions.screenWidth, dimensions.screenHeight),
      material,
    );
    screen.name = `${this.id}:screen`;
    screen.position.set(
      0,
      this.skin === 'jungle' ? 0 : dimensions.screenCentre,
      dimensions.caseDepth / 2 + 0.005,
    );

    screenParent.add(screen);
    ctx.scene.add(this.group);
  }

  update(): void {
    // The screen changes only when the page does; nothing to do per frame.
  }

  dispose(): void {
    if (this.activeValue) {
      this.options.input?.releaseCapture();
    }
    this.activeValue = false;
    this.stopActions();
    this.stopCapture();
    this.player = null;
    this.disposed = true;
    if (this.steleModel) {
      // The asset service owns the model's resources; `disposeObject3D` leaves them alone.
      this.steleModel = null;
      this.assets?.releaseModel(STELE_MODEL);
    }
    this.steleProxy = [];
    this.caseProxy = [];
    // Takes the canvas texture with it: `disposeObject3D` releases every map a material holds.
    disposeObject3D(this.group);
    this.group.clear();
    this.canvasContext = null;
    this.texture = null;
  }

  private open(): void {
    if (this.activeValue || !this.options.input) {
      return;
    }
    this.activeValue = true;
    // Every visit starts on the first page.
    if (this.pageIndexValue !== 0) {
      this.pageIndexValue = 0;
      this.redraw();
    }
    // Square in front of the screen, as the bench seats its visitor: the controls are taken, so
    // the visitor could not turn to it otherwise.
    this.player?.teleport(
      this.reading,
      this.options.rotationY ?? 0,
      this.skin === 'jungle' ? 0 : READING_PITCH,
    );
    this.options.input.capture(TERMINAL_RELEASE_PROMPT);
  }

  private onAction(action: InputAction): void {
    if (!this.activeValue) {
      return;
    }
    if (action === 'down') {
      this.turn(1);
    } else if (action === 'up') {
      this.turn(-1);
    }
  }

  private turn(delta: number): void {
    if (this.pages.length < 2) {
      return;
    }
    this.pageIndexValue = (this.pageIndexValue + delta + this.pages.length) % this.pages.length;
    this.redraw();
  }

  private redraw(): void {
    const context = this.canvasContext;
    if (!context || !this.texture) {
      return;
    }
    const page = this.pages[this.pageIndexValue];
    const jungle = this.skin === 'jungle';
    const width = CANVAS_WIDTH - MARGIN * 2;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fillStyle = jungle ? JUNGLE_BACKGROUND : BACKGROUND;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!jungle) {
      context.fillStyle = MUTED;
      context.font = SMALL_FONT;
      context.fillText(this.options.project.title, MARGIN, 60, width);
    }

    context.fillStyle = jungle ? JUNGLE_ACCENT : ACCENT;
    context.font = jungle ? JUNGLE_TITLE_FONT : TITLE_FONT;
    context.fillText(page.title, MARGIN, 116, width);
    context.fillRect(MARGIN, 136, width, 2);

    context.fillStyle = jungle ? JUNGLE_INK : INK;
    context.font = jungle ? JUNGLE_BODY_FONT : BODY_FONT;
    const measure = (text: string) => context.measureText(text).width;
    const lines = page.lines.flatMap((line) => wrapLine(line, width, measure));
    const room = jungle
      ? JUNGLE_MAX_LINES
      : Math.floor((FOOTER_Y - 48 - BODY_TOP) / LINE_HEIGHT) + 1;
    const shown = lines.length > room ? [...lines.slice(0, room - 1), '…'] : lines;
    shown.forEach((line, index) => {
      context.fillText(line, MARGIN, BODY_TOP + 24 + index * LINE_HEIGHT, width);
    });

    context.fillStyle = jungle ? JUNGLE_MUTED : MUTED;
    context.font = jungle ? JUNGLE_FOOTER_FONT : SMALL_FONT;
    if (jungle) {
      drawJungleFooter(context, this.pageIndexValue, this.pages.length, FOOTER_Y);
    } else {
      const footer = terminalFooter(this.pageIndexValue, this.pages.length);
      context.fillText(footer, MARGIN, FOOTER_Y, width);
    }
    this.texture.needsUpdate = true;
  }

  private createJungleStele(ctx: WorldContext, dimensions: TerminalDimensions): Group {
    const slab = new Mesh(
      new CylinderGeometry(
        JUNGLE_SLAB_RADIUS_TOP,
        JUNGLE_SLAB_RADIUS_BOTTOM,
        JUNGLE_SLAB_HEIGHT,
        4,
        1,
        false,
        Math.PI / 4,
      ),
      new MeshStandardMaterial({
        color: 0x3a4038,
        roughness: 1,
        flatShading: false,
      }),
    );
    slab.name = `${this.id}:slab`;
    slab.scale.z = JUNGLE_SLAB_DEPTH / ((2 * JUNGLE_SLAB_RADIUS_BOTTOM) / Math.SQRT2);
    slab.position.y = JUNGLE_SLAB_HEIGHT / 2;
    slab.castShadow = ctx.quality.shadows;
    this.group.add(slab);
    this.steleProxy = [slab, ...this.addMossEdges(ctx.quality.shadows)];
    this.loadStele(ctx);

    const panel = new Group();
    panel.name = `${this.id}:panel`;
    panel.position.set(
      0,
      dimensions.screenCentre,
      JUNGLE_SLAB_DEPTH / 2 + dimensions.caseDepth / 2,
    );
    panel.rotation.x = JUNGLE_TILT;
    const frame = new Mesh(
      new BoxGeometry(dimensions.caseWidth, dimensions.caseHeight, dimensions.caseDepth),
      new MeshStandardMaterial({ color: JUNGLE_BACKGROUND, roughness: 1, metalness: 0 }),
    );
    frame.name = `${this.id}:body`;
    frame.castShadow = ctx.quality.shadows;
    panel.add(frame);
    this.group.add(panel);
    this.addPlankLabel();
    return panel;
  }

  /** Swaps the procedural slab for the stele model once it arrives; without it the slab stays. */
  private loadStele(ctx: WorldContext): void {
    this.disposed = false;
    this.assets = ctx.assets;
    ctx.assets.model(STELE_MODEL).then(
      (model) => {
        if (this.disposed || this.steleModel) {
          ctx.assets.releaseModel(STELE_MODEL);
          return;
        }
        this.steleModel = model;
        model.name = `${this.id}:stele`;
        model.traverse((object) => {
          if (object instanceof Mesh) {
            object.castShadow = ctx.quality.shadows;
            object.receiveShadow = ctx.quality.shadows;
            if (this.options.haze) {
              object.material = this.options.haze.of(object.material as Material);
            }
          }
        });
        for (const mesh of this.steleProxy) {
          disposeObject3D(mesh);
        }
        this.steleProxy = [];
        this.group.add(model);
      },
      () => undefined,
    );
  }

  /**
   * Swaps the default case and post for the Plaza's kiosk once it arrives: a baked copy of its
   * geometry in a material of the terminal's own, hazed into the square's air. The kiosk is built
   * around the default screen, so the screen stays where it is.
   */
  private loadKiosk(ctx: WorldContext): void {
    this.disposed = false;
    borrowModels(
      ctx.assets,
      [PLAZA_TERMINAL_MODEL],
      () => this.disposed,
      (models) => {
        const node = models.get(PLAZA_TERMINAL_MODEL)!.getObjectByName('terminal');
        const geometry = node ? bakeGeometry(node) : null;
        if (!geometry) {
          return;
        }
        const material = new MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.8,
          metalness: 0,
        });
        // In the Plaza's air, as the square is: hazed on every tier but the lowest.
        const hazed = ctx.quality.shaderDetail > 0 ? this.options.haze?.own(material) : undefined;
        const kiosk = new Mesh(geometry, hazed ?? material);
        kiosk.name = `${this.id}:kiosk`;
        kiosk.castShadow = ctx.quality.shadows;
        kiosk.receiveShadow = ctx.quality.shadows;
        this.caseProxy.forEach((mesh) => disposeObject3D(mesh));
        this.caseProxy = [];
        this.group.add(kiosk);
      },
    );
  }

  private addMossEdges(castShadow: boolean): Mesh[] {
    const edge = 0.045;
    const depth = JUNGLE_SLAB_DEPTH + 0.018;
    const edges = [
      {
        name: 'moss-left',
        geometry: new BoxGeometry(edge, JUNGLE_SLAB_HEIGHT, depth),
        x: -JUNGLE_SLAB_WIDTH / 2 + edge / 2,
        y: JUNGLE_SLAB_HEIGHT / 2,
      },
      {
        name: 'moss-right',
        geometry: new BoxGeometry(edge, JUNGLE_SLAB_HEIGHT, depth),
        x: JUNGLE_SLAB_WIDTH / 2 - edge / 2,
        y: JUNGLE_SLAB_HEIGHT / 2,
      },
      {
        name: 'moss-top',
        geometry: new BoxGeometry(JUNGLE_SLAB_WIDTH, edge, depth),
        x: 0,
        y: JUNGLE_SLAB_HEIGHT - edge / 2,
      },
    ];
    const meshes: Mesh[] = [];
    for (const item of edges) {
      const edgeMesh = new Mesh(
        item.geometry,
        new MeshStandardMaterial({ color: JUNGLE_MOSS, roughness: 1 }),
      );
      edgeMesh.name = `${this.id}:${item.name}`;
      edgeMesh.position.set(item.x, item.y, 0);
      edgeMesh.castShadow = castShadow;
      this.group.add(edgeMesh);
      meshes.push(edgeMesh);
    }
    return meshes;
  }

  private addPlankLabel(): void {
    const label = createLabel(this.options.project.title, '#5a3d27');
    const labelGeometry = label?.geometry as PlaneGeometry | undefined;
    const labelWidth = labelGeometry?.parameters.width ?? 1.8;
    const labelHeight = labelGeometry?.parameters.height ?? 0.6;
    const plankWidth = labelWidth + 0.2;
    const plankHeight = labelHeight + 0.12;
    const plank = new Mesh(
      new BoxGeometry(plankWidth, plankHeight, 0.08),
      new MeshStandardMaterial({ color: JUNGLE_WOOD, roughness: 0.9 }),
    );
    plank.name = `${this.id}:plank`;
    plank.position.set(0, JUNGLE_SLAB_HEIGHT + plankHeight / 2, JUNGLE_SLAB_DEPTH / 2);
    if (label) {
      label.name = `${this.id}:label`;
      label.position.set(0, 0, 0.045);
      plank.add(label);
    }
    this.group.add(plank);
  }
}

interface TerminalDimensions {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly screenCentre: number;
  readonly caseWidth: number;
  readonly caseHeight: number;
  readonly caseDepth: number;
  readonly colliderWidth: number;
  readonly colliderDepth: number;
  readonly readingDistance: number;
}

function terminalDimensions(skin: TerminalSkin): TerminalDimensions {
  if (skin === 'jungle') {
    return {
      screenWidth: JUNGLE_SCREEN_WIDTH,
      screenHeight: JUNGLE_SCREEN_HEIGHT,
      screenCentre: JUNGLE_SCREEN_CENTRE,
      caseWidth: JUNGLE_CASE_WIDTH,
      caseHeight: JUNGLE_CASE_HEIGHT,
      caseDepth: JUNGLE_CASE_DEPTH,
      colliderWidth: JUNGLE_SLAB_WIDTH,
      colliderDepth: JUNGLE_SLAB_DEPTH,
      readingDistance: 1.9,
    };
  }
  return {
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    screenCentre: SCREEN_CENTRE,
    caseWidth: CASE_WIDTH,
    caseHeight: CASE_HEIGHT,
    caseDepth: CASE_DEPTH,
    colliderWidth: skin === 'plaza' ? PLAZA_COLLIDER_WIDTH : CASE_WIDTH,
    colliderDepth: skin === 'plaza' ? PLAZA_COLLIDER_DEPTH : CASE_DEPTH,
    readingDistance: READING_DISTANCE,
  };
}

function drawJungleFooter(
  context: CanvasRenderingContext2D,
  page: number,
  pages: number,
  footerY: number,
): void {
  const rowWidth = pages * JUNGLE_DOT_SIZE + Math.max(0, pages - 1) * JUNGLE_DOT_GAP;
  const firstCenter = (CANVAS_WIDTH - rowWidth) / 2 + JUNGLE_DOT_SIZE / 2;
  for (let index = 0; index < pages; index++) {
    context.fillStyle = index === page ? JUNGLE_ACCENT : JUNGLE_MUTED;
    const centerX = firstCenter + index * (JUNGLE_DOT_SIZE + JUNGLE_DOT_GAP);
    const centerY = footerY - 52;
    if (
      typeof context.beginPath === 'function' &&
      typeof context.arc === 'function' &&
      typeof context.fill === 'function'
    ) {
      context.beginPath();
      context.arc(centerX, centerY, JUNGLE_DOT_SIZE / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(
        centerX - JUNGLE_DOT_SIZE / 2,
        centerY - JUNGLE_DOT_SIZE / 2,
        JUNGLE_DOT_SIZE,
        JUNGLE_DOT_SIZE,
      );
    }
  }
  const right = CANVAS_WIDTH - MARGIN;
  const exit = drawJungleControl(context, 'Esc', 'verlassen', right, footerY);
  drawJungleControl(context, '↑↓', 'blättern', exit.left - JUNGLE_FOOTER_GAP, footerY);
}

function drawJungleControl(
  context: CanvasRenderingContext2D,
  key: string,
  label: string,
  right: number,
  footerY: number,
): { readonly left: number } {
  const keyWidth = context.measureText(key).width + JUNGLE_KEYCAP_PADDING * 2;
  const labelWidth = context.measureText(label).width;
  const totalWidth = keyWidth + JUNGLE_KEYCAP_LABEL_GAP + labelWidth;
  const left = right - totalWidth;
  const top = footerY - JUNGLE_KEYCAP_HEIGHT + 4;

  context.strokeStyle = JUNGLE_INK;
  context.lineWidth = 2;
  context.beginPath?.();
  if (typeof context.roundRect === 'function') {
    context.roundRect(left, top, keyWidth, JUNGLE_KEYCAP_HEIGHT, JUNGLE_KEYCAP_RADIUS);
  } else {
    context.rect?.(left, top, keyWidth, JUNGLE_KEYCAP_HEIGHT);
  }
  context.stroke?.();
  context.fillStyle = JUNGLE_INK;
  context.textAlign = 'center';
  context.fillText(key, left + keyWidth / 2, footerY - 8);
  context.textAlign = 'left';
  context.fillText(label, left + keyWidth + JUNGLE_KEYCAP_LABEL_GAP, footerY - 8);
  return { left };
}

function noop(): void {
  // Nothing to unsubscribe from.
}

function contextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

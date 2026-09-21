import {
  BoxGeometry,
  CanvasTexture,
  Group,
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
/** Entries per page: a longer section — many languages or releases — runs on over more pages. */
export const TERMINAL_LINES_PER_PAGE = 8;

/** What the HUD offers at the terminal, and what it offers while the terminal holds the controls. */
export const TERMINAL_PROMPT = 'Terminal bedienen';
export const TERMINAL_RELEASE_PROMPT = 'Terminal verlassen';

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
  /** The controls the terminal takes while it is used; headless specs may leave it out. */
  readonly input?: InputActionSource;
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
  /** Where the visitor's eyes go while reading: square in front of the screen. */
  readonly reading: Vector3;

  private readonly group = new Group();
  private readonly options: TerminalOptions;
  private readonly stopCapture: () => void;
  private readonly stopActions: () => void;
  private player: PlayerController | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private texture: CanvasTexture | null = null;
  private activeValue = false;
  private pageIndexValue = 0;

  constructor(options: TerminalOptions) {
    this.options = options;
    this.id = options.id;
    this.pages = buildTerminalPages(options.project);
    this.position = options.position.clone();
    this.position.y = options.ground.heightAt(this.position.x, this.position.z);
    this.group.name = this.id;
    this.group.position.copy(this.position);
    this.group.rotation.y = options.rotationY ?? 0;
    const rotationY = options.rotationY ?? 0;
    this.reading = this.position
      .clone()
      .add(
        new Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)).multiplyScalar(READING_DISTANCE),
      );
    this.reading.y = options.ground.heightAt(this.reading.x, this.reading.z) + PLAYER_EYE_HEIGHT;
    this.colliders = [
      rotatedAabb(this.position, CASE_WIDTH / 2, CASE_DEPTH / 2, options.rotationY ?? 0),
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
    const casing = new MeshStandardMaterial({ color: 0x26323a, metalness: 0.25, roughness: 0.6 });
    const body = new Mesh(new BoxGeometry(CASE_WIDTH, CASE_HEIGHT, CASE_DEPTH), casing);
    body.name = `${this.id}:body`;
    body.position.y = SCREEN_CENTRE;
    body.castShadow = ctx.quality.shadows;
    const postHeight = SCREEN_CENTRE - CASE_HEIGHT / 2;
    const post = new Mesh(new BoxGeometry(POST_WIDTH, postHeight, CASE_DEPTH * 0.8), casing);
    post.name = `${this.id}:post`;
    post.position.y = postHeight / 2;
    post.castShadow = ctx.quality.shadows;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    this.canvasContext = contextFor(canvas);
    // Without a 2-D context (jsdom, or a browser that refuses one) the screen stays dark and the
    // terminal still works: the pages turn, only nothing is drawn.
    const material = new MeshBasicMaterial({ color: BACKGROUND });
    if (this.canvasContext) {
      this.texture = new CanvasTexture(canvas);
      this.texture.colorSpace = SRGBColorSpace;
      material.map = this.texture;
      material.color.set(0xffffff);
      this.redraw();
    }
    const screen = new Mesh(new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), material);
    screen.name = `${this.id}:screen`;
    screen.position.set(0, SCREEN_CENTRE, CASE_DEPTH / 2 + 0.005);

    this.group.add(body, post, screen);
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
    this.player?.teleport(this.reading, this.options.rotationY ?? 0, READING_PITCH);
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
    const width = CANVAS_WIDTH - MARGIN * 2;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    context.fillStyle = MUTED;
    context.font = SMALL_FONT;
    context.fillText(this.options.project.title, MARGIN, 60, width);
    context.fillStyle = ACCENT;
    context.font = TITLE_FONT;
    context.fillText(page.title, MARGIN, 116, width);
    context.fillRect(MARGIN, 136, width, 2);

    context.fillStyle = INK;
    context.font = BODY_FONT;
    const measure = (text: string) => context.measureText(text).width;
    const lines = page.lines.flatMap((line) => wrapLine(line, width, measure));
    const room = Math.floor((FOOTER_Y - 48 - BODY_TOP) / LINE_HEIGHT) + 1;
    const shown = lines.length > room ? [...lines.slice(0, room - 1), '…'] : lines;
    shown.forEach((line, index) => {
      context.fillText(line, MARGIN, BODY_TOP + 24 + index * LINE_HEIGHT, width);
    });

    context.fillStyle = MUTED;
    context.font = SMALL_FONT;
    const footer = terminalFooter(this.pageIndexValue, this.pages.length);
    context.fillText(footer, MARGIN, FOOTER_Y, width);
    this.texture.needsUpdate = true;
  }
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

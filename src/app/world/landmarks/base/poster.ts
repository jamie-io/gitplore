import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { Project } from '@content/project.model';

/** CSS-pixel dimensions of poster layout. */
export const POSTER_WIDTH = 620;
export const POSTER_HEIGHT = 387.5;

const POSTER_SCALE = 2;
const CANVAS_WIDTH = POSTER_WIDTH * POSTER_SCALE;
const CANVAS_HEIGHT = Math.ceil(POSTER_HEIGHT) * POSTER_SCALE;
const PADDING_X = 32;
const PADDING_Y = 30;
const COLUMN_GAP = 26;
const FOOTER_Y = POSTER_HEIGHT - PADDING_Y - 1;
/** Every face the poster draws with; each `load` fetches only the face its weight and style name. */
const FONT_LOADS = [
  '800 50px "Barlow"',
  '500 15px "Barlow"',
  'italic 500 13px "Barlow"',
  '600 14px "Barlow"',
  '700 18px "Barlow Semi Condensed"',
  '500 13px "IBM Plex Mono"',
];
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
const FONT_BARLOW = '"Barlow", system-ui, sans-serif';
const FONT_BARLOW_CONDENSED = '"Barlow Semi Condensed", system-ui, sans-serif';

export interface PosterComparison {
  readonly without: string;
  readonly with: string;
}

export interface PosterOptions {
  readonly comparison?: PosterComparison;
  readonly englishSummary?: string;
  readonly kicker?: string;
}

export function createPosterMaterial(
  project: Project,
  options: PosterOptions = {},
): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    return new MeshBasicMaterial({ color: 0x141b17 });
  }

  const redraw = () => drawPoster(context, project, options);
  redraw();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const fonts = document.fonts;
  if (fonts) {
    Promise.all(FONT_LOADS.map((font) => fonts.load(font))).then(
      () => {
        redraw();
        texture.needsUpdate = true;
      },
      () => undefined,
    );
  }

  return new MeshBasicMaterial({ map: texture });
}

function drawPoster(
  context: CanvasRenderingContext2D,
  project: Project,
  options: PosterOptions,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.scale(POSTER_SCALE, POSTER_SCALE);
  context.textAlign = 'left';
  context.textBaseline = 'top';
  setLetterSpacing(context, '0px');

  fillRoundedRect(context, 0, 0, POSTER_WIDTH, POSTER_HEIGHT, 0, '#0b0f0d');
  fillRoundedRect(context, 10, 10, POSTER_WIDTH - 20, POSTER_HEIGHT - 20, 6, '#141b17');

  const contentWidth = POSTER_WIDTH - PADDING_X * 2;
  const leftWidth = (contentWidth - COLUMN_GAP) * (1.25 / 2.25);
  const rightX = PADDING_X + leftWidth + COLUMN_GAP;
  const rightWidth = contentWidth - leftWidth - COLUMN_GAP;
  const columnWidth = options.comparison ? leftWidth : contentWidth;

  let leftY = PADDING_Y;
  context.font = `600 12px ${FONT_MONO}`;
  context.fillStyle = '#e0a13c';
  setLetterSpacing(context, '0.06em');
  context.fillText((options.kicker ?? 'Projekt').toUpperCase(), PADDING_X, leftY);
  setLetterSpacing(context, '0px');
  leftY += 12 + 12;

  context.font = `800 50px ${FONT_BARLOW}`;
  context.fillStyle = '#f4efe4';
  context.fillText(project.title, PADDING_X, leftY);
  leftY += 50 + 12;

  context.font = `500 15px ${FONT_BARLOW}`;
  context.fillStyle = '#d9d3c6';
  leftY = drawWrapped(context, project.summary, PADDING_X, leftY, columnWidth, 15 * 1.45);

  if (options.englishSummary) {
    leftY += 12;
    context.font = `italic 500 13px ${FONT_BARLOW}`;
    context.fillStyle = '#9aa89f';
    drawWrapped(context, options.englishSummary, PADDING_X, leftY, columnWidth, 13 * 1.4);
  }

  context.font = `500 11px ${FONT_MONO}`;
  drawChips(context, project.tags, PADDING_X, columnWidth, FOOTER_Y - 6);

  if (options.comparison) {
    drawComparison(context, options.comparison, rightX, rightWidth);
  }

  context.strokeStyle = '#2a3530';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(PADDING_X, FOOTER_Y);
  context.lineTo(POSTER_WIDTH - PADDING_X, FOOTER_Y);
  context.stroke();

  context.font = `500 13px ${FONT_MONO}`;
  context.fillStyle = '#9aa89f';
  context.fillText(shortRepoUrl(project.repoUrl), PADDING_X, FOOTER_Y + 12);
  drawFooterHint(context, FOOTER_Y, POSTER_WIDTH - PADDING_X);
}

function drawChips(
  context: CanvasRenderingContext2D,
  tags: readonly string[],
  x: number,
  maxWidth: number,
  bottom: number,
): void {
  const chipHeight = 19;
  const chipGap = 6;
  const chips = tags.map((tag) => ({
    tag,
    width: context.measureText(tag).width + 14,
  }));
  const rows: { tag: string; width: number }[][] = [[]];
  let rowWidth = 0;
  chips.forEach((chip) => {
    const nextWidth = rowWidth ? rowWidth + chipGap + chip.width : chip.width;
    if (rowWidth && nextWidth > maxWidth) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push(chip);
    rowWidth += rowWidth ? chipGap + chip.width : chip.width;
  });

  const y = bottom - rows.length * chipHeight - (rows.length - 1) * chipGap;
  rows.forEach((row, rowIndex) => {
    let chipX = x;
    const chipY = y + rowIndex * (chipHeight + chipGap);
    row.forEach((chip) => {
      strokeRoundedRect(context, chipX, chipY, chip.width, chipHeight, 4, '#3a463f');
      context.fillStyle = '#f4efe4';
      context.fillText(chip.tag, chipX + 7, chipY + 3);
      chipX += chip.width + chipGap;
    });
  });
}

function drawComparison(
  context: CanvasRenderingContext2D,
  comparison: PosterComparison,
  x: number,
  width: number,
): void {
  context.font = `700 18px ${FONT_BARLOW_CONDENSED}`;
  const textWidth = width - 28;
  const slopLines = wrappedLines(context, comparison.without, textWidth);
  const originalLines = wrappedLines(context, comparison.with, textWidth);
  const boxHeight = (lines: number) => 10 + 10 + 12 + lines * (18 * 1.2) + 3;
  const slopHeight = boxHeight(slopLines.length);
  const originalHeight = boxHeight(originalLines.length);
  const arrowHeight = 18;
  const totalHeight = slopHeight + 3 + arrowHeight + 3 + originalHeight;
  let y = PADDING_Y + (FOOTER_Y - PADDING_Y - totalHeight) / 2;

  drawComparisonBox(
    context,
    comparison.without,
    x,
    y,
    width,
    slopHeight,
    '#1f1720',
    '#b0479f',
    '#e39ad6',
    'OHNE · WITHOUT',
    '#e8dfe8',
  );
  y += slopHeight + 3;

  context.font = `600 18px ${FONT_MONO}`;
  context.fillStyle = '#e0a13c';
  context.fillText('↓', x + 14, y);
  y += arrowHeight + 3;

  drawComparisonBox(
    context,
    comparison.with,
    x,
    y,
    width,
    originalHeight,
    '#221c10',
    '#e0a13c',
    '#e0a13c',
    'MIT · WITH',
    '#f4efe4',
  );
}

function drawComparisonBox(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  background: string,
  border: string,
  labelColor: string,
  label: string,
  textColor: string,
): void {
  fillRoundedRect(context, x, y, width, height, 0, background);
  context.fillStyle = border;
  context.fillRect(x, y, 4, height);
  context.font = `600 10px ${FONT_MONO}`;
  context.fillStyle = labelColor;
  context.fillText(label, x + 16, y + 10);
  context.font = `700 18px ${FONT_BARLOW_CONDENSED}`;
  context.fillStyle = textColor;
  drawWrapped(context, text, x + 16, y + 22, width - 28, 18 * 1.2);
}

function drawFooterHint(context: CanvasRenderingContext2D, y: number, right: number): void {
  const label = 'Details, README & Code';
  context.font = `600 14px ${FONT_BARLOW}`;
  const labelWidth = context.measureText(label).width;
  const keyWidth = context.measureText('E').width + 14;
  const keyX = right - labelWidth - 8 - keyWidth;
  strokeRoundedRect(context, keyX, y + 9, keyWidth, 18, 4, '#f4efe4', 1.5);
  context.font = `600 12px ${FONT_MONO}`;
  context.fillStyle = '#f4efe4';
  context.fillText('E', keyX + 7, y + 11);
  context.font = `600 14px ${FONT_BARLOW}`;
  context.fillText(label, keyX + keyWidth + 8, y + 10);
}

function drawWrapped(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrappedLines(context, text, maxWidth);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  let line = '';
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  lineWidth = 1,
): void {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
}

function setLetterSpacing(context: CanvasRenderingContext2D, value: string): void {
  (context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = value;
}

function shortRepoUrl(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\//, '');
}

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { CANVAS_HEIGHT, createLabel, LABEL_HEIGHT, PAD } from './label';

/** The exact font the spec pins for labels. */
const FONT = '700 120px "Barlow Semi Condensed", system-ui, sans-serif';
/** Fixture metric: every character measures this many canvas pixels wide. */
const WIDTH_PER_CHAR = 20;
/** Long enough that ceil(width) + 2 * PAD lands beyond the old fixed 1024 px canvas. */
const LONG = 'Commits im Lebensverlauf · alles seit dem ersten Push';

function mockCanvas() {
  const fillRect = vi.fn();
  const fillText = vi.fn();
  const measureText = vi.fn((text: string) => ({ width: text.length * WIDTH_PER_CHAR }));
  const context = {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect,
    fillText,
    measureText,
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  return { context, fillRect, fillText, measureText };
}

function canvasOf(label: Mesh): HTMLCanvasElement {
  return ((label.material as MeshBasicMaterial).map as CanvasTexture).image as HTMLCanvasElement;
}

function textureOf(label: Mesh): CanvasTexture {
  return (label.material as MeshBasicMaterial).map as CanvasTexture;
}

function geometryOf(label: Mesh): PlaneGeometry {
  return label.geometry as PlaneGeometry;
}

/** Lets the `document.fonts.load` promise chain settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Puts a Font Loading API on `document`; the afterEach hook takes it away again. */
function stubFonts(settles: 'resolve' | 'reject'): ReturnType<typeof vi.fn> {
  const load = vi.fn(() =>
    settles === 'resolve' ? Promise.resolve([]) : Promise.reject(new Error('no font')),
  );
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  return load;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fonts');
});

describe('createLabel', () => {
  it('measures the text in Barlow Semi Condensed before it draws', () => {
    const { context, fillText, measureText } = mockCanvas();

    createLabel('Kontakt', '#2c3a40');

    expect(context.font).toBe(FONT);
    expect(measureText).toHaveBeenCalledOnce();
    expect(measureText.mock.invocationCallOrder[0]).toBeLessThan(
      fillText.mock.invocationCallOrder[0],
    );
  });

  it('widens a long label to the next power of two of ceil(width) + 2 * PAD', () => {
    const { fillRect } = mockCanvas();

    const label = createLabel(LONG, '#2c3a40');
    const canvas = canvasOf(label!);

    const expected = 2 ** Math.ceil(Math.log2(LONG.length * WIDTH_PER_CHAR + 2 * PAD));
    expect(canvas.width).toBe(expected);
    // Beyond the fixed 1024×256 canvas this replaces.
    expect(canvas.width).toBeGreaterThan(1024);
    expect(canvas.height).toBe(CANVAS_HEIGHT);
    const used = LONG.length * WIDTH_PER_CHAR + 2 * PAD;
    expect(fillRect).toHaveBeenCalledWith(0, 0, used, CANVAS_HEIGHT);
    // The repeat crops the unused power-of-two tail off the plane.
    expect(textureOf(label!).repeat.x).toBeCloseTo(used / canvas.width, 9);
  });

  it('keeps a short label on a power-of-two width of its own', () => {
    mockCanvas();

    const label = createLabel('Kontakt', '#2c3a40');

    // 7 chars × 20 px + 2 × 40 px = 220, so 256.
    expect(canvasOf(label!).width).toBe(256);
  });

  it('passes no max width to fillText, so nothing truncates', () => {
    const { fillText } = mockCanvas();

    createLabel(LONG, '#2c3a40');
    const call = fillText.mock.calls[0];

    expect(call).toHaveLength(3);
    expect(call[0]).toBe(LONG);
    expect(call[1]).toBe((LONG.length * WIDTH_PER_CHAR + 2 * PAD) / 2);
    expect(call[2]).toBe(CANVAS_HEIGHT / 2);
  });

  it('sizes the plane to the texture: HEIGHT * w / CANVAS_H', () => {
    mockCanvas();

    const label = createLabel(LONG, '#2c3a40');
    const canvas = canvasOf(label!);
    const { parameters } = geometryOf(label!);

    const used = LONG.length * WIDTH_PER_CHAR + 2 * PAD;
    expect(parameters.width).toBeCloseTo((LABEL_HEIGHT * used) / CANVAS_HEIGHT, 9);
    expect(parameters.height).toBe(LABEL_HEIGHT);
    expect(parameters.width / parameters.height).toBeCloseTo(
      (used * textureOf(label!).repeat.y) / canvas.height,
      9,
    );
  });

  it('redraws the texture once the web font has loaded', async () => {
    const { fillText } = mockCanvas();
    const load = stubFonts('resolve');

    const label = createLabel('Kontakt', '#2c3a40');
    expect(load).toHaveBeenCalledWith(FONT);
    expect(fillText).toHaveBeenCalledOnce();

    await flush();

    expect(fillText).toHaveBeenCalledTimes(2);
    expect(textureOf(label!).version).toBe(2);
  });

  it('keeps the drawn label when the font fails to load', async () => {
    const { fillText } = mockCanvas();
    stubFonts('reject');

    const label = createLabel('Kontakt', '#2c3a40');
    await flush();

    expect(label).not.toBeNull();
    expect(textureOf(label!).image).toBeDefined();
    expect(fillText).toHaveBeenCalledOnce();
  });

  it('ignores a late font redraw after its texture was disposed', async () => {
    const { fillText } = mockCanvas();
    stubFonts('resolve');

    const label = createLabel(LONG, '#2c3a40')!;
    textureOf(label).dispose();
    await flush();

    expect(fillText).toHaveBeenCalledOnce();
  });

  it('draws without document.fonts at all', () => {
    Reflect.deleteProperty(document, 'fonts');
    const { fillText } = mockCanvas();

    const label = createLabel('Kontakt', '#2c3a40');

    expect(label).not.toBeNull();
    expect(fillText).toHaveBeenCalledOnce();
  });

  it('returns null where no 2D context exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(createLabel('Kontakt', '#2c3a40')).toBeNull();
  });
});

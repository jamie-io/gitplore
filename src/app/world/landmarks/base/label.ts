import {
  CanvasTexture,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

/** Canvas height of a label texture, in pixels; the width is measured from the text. */
export const CANVAS_HEIGHT = 256;

/** World height of the label plane, in metres; the width follows the canvas aspect. */
export const LABEL_HEIGHT = 0.6;

/** Horizontal padding, in canvas pixels, kept clear on both sides of the measured text. */
export const PAD = 40;

/** Barlow Semi Condensed is self-hosted (styles.scss); the stack covers the frames before it loads. */
export const LABEL_FONT = '700 120px "Barlow Semi Condensed", system-ui, sans-serif';

/**
 * A floating text label drawn onto a canvas texture. The canvas and the plane are measured to fit
 * the text, and the texture is redrawn once the web font has loaded. Returns `null` where no 2D
 * context exists (headless unit tests), so callers simply skip the sign.
 */
export function createLabel(text: string, color: string): Mesh | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  // The text fills `width` pixels of a power-of-two canvas; the texture repeat crops the rest, so
  // the plane is exactly as wide as the text plus its padding.
  const draw = (): number => {
    context.font = LABEL_FONT;
    const width = Math.ceil(context.measureText(text).width) + 2 * PAD;
    // Resizing the canvas resets every context state, so the font goes back on before drawing.
    canvas.width = MathUtils.ceilPowerOfTwo(width);
    canvas.height = CANVAS_HEIGHT;
    context.font = LABEL_FONT;
    context.fillStyle = color;
    context.fillRect(0, 0, width, CANVAS_HEIGHT);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, CANVAS_HEIGHT / 2);
    return width;
  };

  const plane = (width: number): PlaneGeometry =>
    new PlaneGeometry((LABEL_HEIGHT * width) / CANVAS_HEIGHT, LABEL_HEIGHT);

  let width = draw();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  let disposed = false;
  const onDispose = (): void => {
    disposed = true;
    texture.removeEventListener('dispose', onDispose);
  };
  texture.addEventListener('dispose', onDispose);
  texture.repeat.x = width / canvas.width;
  const mesh = new Mesh(plane(width), new MeshBasicMaterial({ map: texture, transparent: false }));
  mesh.name = 'label';

  const redraw = (): void => {
    if (disposed) {
      return;
    }
    const fitted = draw();
    texture.repeat.x = fitted / canvas.width;
    if (fitted !== width) {
      mesh.geometry.dispose();
      mesh.geometry = plane(fitted);
      width = fitted;
    }
    texture.needsUpdate = true;
  };
  // Guarded for environments without the Font Loading API; a missing or failed web font leaves the
  // already-drawn fallback texture in place.
  document.fonts?.load(LABEL_FONT).then(redraw, () => undefined);

  return mesh;
}

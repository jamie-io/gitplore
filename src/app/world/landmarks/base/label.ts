import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 256;

/** World height of the label plane, in metres; the width follows the canvas aspect. */
const LABEL_HEIGHT = 0.6;

/**
 * A floating text label drawn onto a canvas texture. Returns `null` where no 2D context exists
 * (headless unit tests), so callers simply skip the sign.
 */
export function createLabel(text: string, color: string): Mesh | null {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.fillStyle = color;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = '#ffffff';
  context.font = 'bold 120px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH - 80);

  const texture = new CanvasTexture(canvas);
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  const mesh = new Mesh(
    new PlaneGeometry(LABEL_HEIGHT * aspect, LABEL_HEIGHT),
    new MeshBasicMaterial({ map: texture, transparent: false }),
  );
  mesh.name = 'label';
  return mesh;
}

import { CanvasTexture, MeshBasicMaterial } from 'three';
import { PROJECT_FIXTURES as PROJECTS } from '@content/testing/project-fixtures';
import { createPosterMaterial } from './poster';

function posterContext() {
  const fillText = vi.fn();
  const canvasContext = {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    font: '',
    lineWidth: 1,
    strokeStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillText,
    measureText: (text: string) => ({ width: text.length * 8 }),
    scale: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  return { canvas, fillText };
}

describe('poster', () => {
  it('draws the optional comparison block using project data', () => {
    const { canvas, fillText } = posterContext();
    const project = PROJECTS.find((entry) => entry.slug === 'deslopify')!;

    const material = createPosterMaterial(project, {
      kicker: 'Projekt · Browser-Erweiterung',
      englishSummary: 'English summary',
      comparison: { without: 'Slop title', with: 'Original title' },
    });

    const texture = (material as MeshBasicMaterial).map as CanvasTexture;
    const written = fillText.mock.calls.map(([text]) => text as string);
    const posterText = written.join(' ');
    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(texture.image.width).toBe(1240);
    expect(texture.image.height).toBe(776);
    expect(written).toContain('OHNE · WITHOUT');
    expect(written).toContain('Slop title');
    expect(written).toContain('MIT · WITH');
    expect(posterText).toContain('Original title');

    material.dispose();
    canvas.mockRestore();
  });
});

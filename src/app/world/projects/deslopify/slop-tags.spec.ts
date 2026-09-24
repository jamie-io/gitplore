import { CanvasTexture, Line, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { SLOP_TAGS } from './deslopify.data';
import { SlopTags } from './slop-tags';

function canvasContext(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const ANCHORS = [
  new Vector3(1, 6, 2),
  new Vector3(-2, 5.5, -4),
  new Vector3(4, 7, -8),
  new Vector3(0, 5, -12),
  new Vector3(3, 6, -16),
];

describe('SlopTags', () => {
  it('builds two strings and two faces per anchor, cycling canonical tag data', () => {
    const tags = new SlopTags({ anchors: ANCHORS });
    const lines: Line[] = [];
    const faces: Mesh[] = [];
    tags.object.traverse((child) => {
      if (child instanceof Line) lines.push(child);
      if (child instanceof Mesh) faces.push(child);
    });

    expect(tags.object.userData['tagCount']).toBe(ANCHORS.length);
    expect(lines).toHaveLength(ANCHORS.length * 2);
    expect(faces).toHaveLength(ANCHORS.length * 2);
    expect(tags.object.children.map((child) => child.position.toArray())).toEqual(
      ANCHORS.map((anchor) => anchor.toArray()),
    );
    expect(faces[0]?.material).toBeInstanceOf(MeshStandardMaterial);
    expect(((faces[0]?.material as MeshStandardMaterial).map as CanvasTexture).image.width).toBe(
      512,
    );
    expect(((faces[0]?.material as MeshStandardMaterial).map as CanvasTexture).image.height).toBe(
      240,
    );
  });

  it('draws exact uppercase labels and detail strings on both faces', () => {
    const context = canvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    new SlopTags({ anchors: [ANCHORS[0]] });

    const text = vi.mocked(context.fillText).mock.calls.map(([value]) => value);
    expect(text).toContain(SLOP_TAGS[0].slop.toUpperCase());
    expect(text).toContain(SLOP_TAGS[0].slopDetail);
    expect(text).toContain(SLOP_TAGS[0].original.toUpperCase());
    expect(text).toContain(SLOP_TAGS[0].originalDetail);
  });

  it('flips at 2.6 per second, returns at 1.4, and clamps at both ends', () => {
    const tags = new SlopTags({ anchors: [ANCHORS[0]] });

    tags.update(0.2, () => true);
    expect(tags.flipped(0)).toBe(true);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBeCloseTo(
      Math.abs(Math.cos(0.2 * 2.6 * Math.PI)),
    );

    tags.update(10, () => true);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBe(1);
    expect(tags.flipped(0)).toBe(true);

    tags.update(0.5, () => false);
    expect(tags.flipped(0)).toBe(false);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBeCloseTo(
      Math.abs(Math.cos(0.3 * Math.PI)),
    );

    tags.update(10, () => false);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBe(1);
    expect(tags.flipped(0)).toBe(false);
  });

  it('snaps to face state under reduced motion', () => {
    const tags = new SlopTags({ anchors: [ANCHORS[0]], reducedMotion: true });

    tags.update(0.01, () => true);
    expect(tags.flipped(0)).toBe(true);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBe(1);

    tags.update(0.01, () => false);
    expect(tags.flipped(0)).toBe(false);
    expect(tags.object.getObjectByName('slop-tag-face:0')?.scale.x).toBe(1);
  });

  it('disposes face textures and object graph', () => {
    const tags = new SlopTags({ anchors: ANCHORS.slice(0, 2) });
    const textures: CanvasTexture[] = [];
    const materials: MeshStandardMaterial[] = [];
    tags.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material as MeshStandardMaterial;
      materials.push(material);
      if (material.map instanceof CanvasTexture) textures.push(material.map);
    });
    const textureDisposals = textures.map((texture) => vi.spyOn(texture, 'dispose'));
    const materialDisposals = materials.map((material) => vi.spyOn(material, 'dispose'));

    tags.dispose();

    expect(tags.object.children).toEqual([]);
    expect(textureDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(materialDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  });
});

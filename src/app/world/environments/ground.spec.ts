import { Color, Mesh, MeshStandardMaterial } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { ProceduralGround } from './ground';

function build(options: Partial<ConstructorParameters<typeof ProceduralGround>[0]> = {}) {
  const ctx = stubContext();
  const ground = new ProceduralGround({
    size: 10,
    color: 0x336633,
    segments: 4,
    heightAt: (x) => x * 0.1,
    ...options,
  });
  ground.init(ctx);
  return ctx.scene.children[0] as Mesh;
}

describe('ProceduralGround colours', () => {
  it('paints every triangle in one colour, sampled once per face', () => {
    const mesh = build({ colorAt: (x) => new Color(x > 0 ? 0xff0000 : 0x0000ff) });
    const colour = mesh.geometry.getAttribute('color');

    expect(colour.count).toBe(mesh.geometry.getAttribute('position').count);
    for (let face = 0; face < colour.count; face += 3) {
      for (const corner of [1, 2]) {
        expect(colour.getX(face + corner)).toBe(colour.getX(face));
        expect(colour.getY(face + corner)).toBe(colour.getY(face));
        expect(colour.getZ(face + corner)).toBe(colour.getZ(face));
      }
    }
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(true);
  });

  it('reports a slope of 0 for level ground', () => {
    const slopes: number[] = [];
    build({
      heightAt: () => 0,
      colorAt: (_x, _z, _height, slope) => {
        slopes.push(slope);
        return new Color(0xffffff);
      },
    });

    expect(slopes.length).toBeGreaterThan(0);
    expect(Math.max(...slopes)).toBeCloseTo(0, 6);
  });

  it('keeps a single material colour when no colorAt is given', () => {
    const mesh = build();

    expect(mesh.geometry.getAttribute('color')).toBeUndefined();
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(false);
  });

  it('lets the owner decorate the material before first use', () => {
    const seen: MeshStandardMaterial[] = [];
    const mesh = build({ decorate: (material) => void seen.push(material) });

    expect(seen).toEqual([mesh.material]);
  });
});

import { Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
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

const rolling = (x: number, z: number) => Math.sin(x * 0.7) * Math.cos(z * 0.5);

describe('ProceduralGround shape', () => {
  it('keeps the grid indexed, so neighbouring triangles share their corners', () => {
    const mesh = build({ heightAt: rolling, segments: 8 });
    const { geometry } = mesh;
    const position = geometry.getAttribute('position');

    expect(geometry.index).not.toBeNull();
    expect(position.count).toBe(9 * 9);
    expect(geometry.getAttribute('normal').count).toBe(position.count);
    // Every corner of the grid is stored once: no triangle carries its own copy of a vertex.
    const keys = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      keys.add(`${position.getX(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
    expect(keys.size).toBe(position.count);
  });

  it('shades smoothly: one normal per corner, following the slope of the height function', () => {
    const mesh = build({ heightAt: rolling, size: 20, segments: 80 });
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const analytic = new Vector3();
    const baked = new Vector3();
    const step = 1e-3;

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      if (Math.abs(x) > 9 || Math.abs(z) > 9) {
        continue; // The rim has triangles on one side only.
      }
      const dx = (rolling(x + step, z) - rolling(x - step, z)) / (2 * step);
      const dz = (rolling(x, z + step) - rolling(x, z - step)) / (2 * step);
      analytic.set(-dx, 1, -dz).normalize();
      baked.fromBufferAttribute(normal, i);
      expect(baked.dot(analytic)).toBeGreaterThan(0.999);
    }
  });

  it('never leans on flat shading, whose derivatives break under SwiftShader', () => {
    const mesh = build({ heightAt: rolling });

    expect((mesh.material as MeshStandardMaterial).flatShading).toBe(false);
  });
});

describe('ProceduralGround colours', () => {
  it('samples a colour at every corner, so colours blend across a triangle', () => {
    const seen: [number, number, number][] = [];
    const mesh = build({
      colorAt: (x, z, height) => {
        seen.push([x, z, height]);
        return new Color(x > 0 ? 0xff0000 : 0x0000ff);
      },
    });
    const { geometry } = mesh;
    const colour = geometry.getAttribute('color');
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    if (!index) {
      throw new Error('expected an indexed ground');
    }

    expect(colour.count).toBe(position.count);
    expect(seen).toHaveLength(position.count);
    for (let i = 0; i < position.count; i++) {
      expect(seen[i]).toEqual([position.getX(i), position.getZ(i), position.getY(i)]);
      expect(colour.getX(i)).toBe(position.getX(i) > 0 ? 1 : 0);
    }
    // Where red meets blue at least one triangle has corners of both: no per-face colours.
    let mixed = 0;
    for (let t = 0; t < index.count; t += 3) {
      const reds = [0, 1, 2].filter((k) => colour.getX(index.getX(t + k)) === 1).length;
      if (reds === 1 || reds === 2) {
        mixed++;
      }
    }
    expect(mixed).toBeGreaterThan(0);
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(true);
  });

  it('reports a slope of 0 for level ground and the ramp for a slope', () => {
    const level: number[] = [];
    build({
      heightAt: () => 0,
      colorAt: (_x, _z, _height, slope) => {
        level.push(slope);
        return new Color(0xffffff);
      },
    });
    const ramp: number[] = [];
    build({
      colorAt: (_x, _z, _height, slope) => {
        ramp.push(slope);
        return new Color(0xffffff);
      },
    });

    expect(level.length).toBeGreaterThan(0);
    expect(Math.max(...level)).toBeCloseTo(0, 6);
    for (const slope of ramp) {
      expect(slope).toBeCloseTo(1 - 1 / Math.hypot(1, 0.1), 6);
    }
  });

  it('keeps a single material colour when no colorAt is given', () => {
    const mesh = build();

    expect(mesh.geometry.getAttribute('color')).toBeUndefined();
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(false);
  });

  it('lets the owner decorate the material before first use, knowing the tier', () => {
    const seen: [MeshStandardMaterial, number][] = [];
    const mesh = build({
      decorate: (material, quality) => void seen.push([material, quality.shaderDetail]),
    });

    expect(seen).toEqual([[mesh.material, 1]]);
  });
});

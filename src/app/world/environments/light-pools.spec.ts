import { AdditiveBlending, InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from 'three';
import { stubContext } from '@engine/testing/world-context';
import { LightPools } from './light-pools';

const POOLS = [
  { x: -8, z: 0, radius: 3 },
  { x: 0, z: 0, radius: 3 },
  { x: 8, z: -4, radius: 1.5 },
] as const;

function build() {
  const ctx = stubContext();
  const pools = new LightPools({ pools: POOLS, colour: 0xfff1dc, intensity: 0.2 });
  pools.init(ctx);
  const mesh = ctx.scene.getObjectByName('light-pools');
  return { ctx, pools, mesh };
}

describe('LightPools', () => {
  it('draws one instance per pool', () => {
    const { pools, mesh } = build();

    expect(mesh).toBeInstanceOf(InstancedMesh);
    expect((mesh as InstancedMesh).count).toBe(POOLS.length);
    pools.dispose();
  });

  it('adds light without writing depth', () => {
    const { pools, mesh } = build();
    const material = (mesh as InstancedMesh).material as ShaderMaterial;

    expect(material.blending).toBe(AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    pools.dispose();
  });

  it('lies on the floor and covers each pool', () => {
    const { pools, mesh } = build();
    const instanced = mesh as InstancedMesh;
    const position = instanced.geometry.getAttribute('position');
    const matrix = new Matrix4();
    const vertex = new Vector3();

    POOLS.forEach((pool, index) => {
      instanced.getMatrixAt(index, matrix);
      let maxX = -Infinity;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
        expect(vertex.y).toBeGreaterThan(0);
        expect(vertex.y).toBeLessThanOrEqual(0.02);
        maxX = Math.max(maxX, vertex.x);
      }
      expect(maxX).toBeCloseTo(pool.x + pool.radius, 5);
    });
    pools.dispose();
  });

  it('leaves the scene empty when disposed', () => {
    const { ctx, pools } = build();

    pools.dispose();

    expect(ctx.scene.children.length).toBe(0);
  });
});

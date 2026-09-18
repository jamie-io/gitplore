import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { valueNoise } from './random';

/** One ring of distant hills around the origin. */
export interface HillRing {
  /** Distance from the origin to the crest, in metres. */
  readonly radius: number;
  /** Metres from the ring's inner foot to its outer foot. */
  readonly depth: number;
  /** Highest a crest may rise, in metres. */
  readonly height: number;
  /** 0 for smooth swells, 1 for jagged peaks. */
  readonly roughness: number;
  readonly color: number;
  /** How far the colour is pulled into the horizon haze: 0 not at all, 1 completely. */
  readonly haze: number;
  readonly seed: number;
}

const SEGMENTS = 96;
/** How far below the ground the inner foot sinks, so no gap shows at the terrain's edge. */
const FOOT_DEPTH = 6;

/**
 * Rings of distant hills that hide where the walkable ground ends. Their haze is baked into their
 * colours and they ignore fog, so they read the same at every tier's draw distance.
 */
export class Backdrop implements WorldObject {
  readonly id = 'backdrop';

  private readonly meshes: Mesh[] = [];

  constructor(
    private readonly rings: readonly HillRing[],
    private readonly horizon: number,
  ) {}

  init(ctx: WorldContext): void {
    const horizon = new Color(this.horizon);
    for (const ring of this.rings) {
      const mesh = new Mesh(
        ringGeometry(ring, horizon),
        new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, fog: false }),
      );
      mesh.name = 'backdrop';
      this.meshes.push(mesh);
      ctx.scene.add(mesh);
    }
  }

  update(): void {
    // Static: the hills do not move.
  }

  dispose(): void {
    this.meshes.forEach(disposeObject3D);
    this.meshes.length = 0;
  }
}

/**
 * Crest height at `angle`. Noise is sampled on a circle, so the ring meets itself with no seam, and
 * the product of the two factors never exceeds `ring.height`.
 */
export function crestHeight(ring: HillRing, angle: number): number {
  const x = Math.cos(angle) * 3;
  const z = Math.sin(angle) * 3;
  const swell = valueNoise(x, z, ring.seed);
  const jag = valueNoise(x * 4, z * 4, ring.seed + 1);
  return (
    ring.height * (0.45 + 0.55 * swell) * (1 - ring.roughness * 0.35 + ring.roughness * 0.35 * jag)
  );
}

function ringGeometry(ring: HillRing, horizon: Color): BufferGeometry {
  // Three rows per angle: the inner foot (sunk), the crest, the outer foot.
  const rows = [
    { radius: ring.radius - ring.depth / 2, height: () => -FOOT_DEPTH },
    { radius: ring.radius, height: (angle: number) => crestHeight(ring, angle) },
    {
      radius: ring.radius + ring.depth / 2,
      height: (angle: number) => crestHeight(ring, angle) * 0.35,
    },
  ];
  const positions: number[] = [];
  for (const row of rows) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      positions.push(
        Math.sin(angle) * row.radius,
        row.height(angle),
        -Math.cos(angle) * row.radius,
      );
    }
  }

  const stride = SEGMENTS + 1;
  const index: number[] = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = row * stride + i;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      // Wound so the inner slope faces the origin, where the visitor stands.
      index.push(a, b, c, a, c, d);
    }
  }

  const indexed = new BufferGeometry();
  indexed.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  indexed.setIndex(index);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();

  const base = new Color(ring.color);
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const colour = new Color();
  for (let face = 0; face < position.count; face += 3) {
    const height = (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3;
    // Higher faces sit deeper in the haze; faces dipping below the ground get no extra.
    const haze = Math.min(1, ring.haze + 0.25 * (Math.max(0, height) / ring.height));
    colour.copy(base).lerp(horizon, haze);
    for (let corner = 0; corner < 3; corner++) {
      colours.set([colour.r, colour.g, colour.b], (face + corner) * 3);
    }
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return geometry;
}

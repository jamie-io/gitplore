import { Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import {
  POND,
  POND_WATER_LEVEL,
  RELIEF,
  TERRAIN_FLAT_RADIUS,
  TERRAIN_MAX_HEIGHT,
  Terrain,
  terrainGlsl,
  terrainHeightAt,
} from './terrain';
import { RING_RADIUS } from './placement';

describe('terrainHeightAt', () => {
  it('returns the same height for the same point', () => {
    expect(terrainHeightAt(31.5, -12.25)).toBe(terrainHeightAt(31.5, -12.25));
  });

  it('is perfectly flat around the spawn so landmarks sit level', () => {
    expect(terrainHeightAt(0, 0)).toBe(0);
    expect(terrainHeightAt(TERRAIN_FLAT_RADIUS - 0.5, 0)).toBe(0);
    expect(terrainHeightAt(0, -TERRAIN_FLAT_RADIUS + 0.5)).toBe(0);
  });

  it('has relief once you leave the flat centre', () => {
    const samples = [];
    for (let x = -100; x <= 100; x += 7) samples.push(terrainHeightAt(x, x * 0.7));

    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
  });

  it('stays within the advertised height range', () => {
    for (let x = -120; x <= 120; x += 3) {
      for (let z = -120; z <= 120; z += 3) {
        expect(Math.abs(terrainHeightAt(x, z))).toBeLessThanOrEqual(TERRAIN_MAX_HEIGHT);
      }
    }
  });

  it('is continuous, so the player never hits a cliff edge', () => {
    for (let x = -60; x <= 60; x += 1.5) {
      const step = Math.abs(terrainHeightAt(x + 0.1, 20) - terrainHeightAt(x, 20));
      expect(step).toBeLessThan(0.25);
    }
  });
});

describe('Terrain shading', () => {
  it('shades smoothly from vertex normals rather than relying on flat shading derivatives', () => {
    const ctx = {
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      player: new PlayerController(),
      quality: qualitySettings('low'),
      assets: new StubAssets(),
    };
    const terrain = new Terrain();

    terrain.init(ctx);

    const mesh = ctx.scene.children[0] as Mesh;
    expect(mesh.geometry.index).not.toBeNull();
    expect((mesh.material as MeshStandardMaterial).flatShading).toBe(false);
    expect(mesh.geometry.getAttribute('normal').count).toBe(
      mesh.geometry.getAttribute('position').count,
    );
  });
});

describe('terrain tables', () => {
  it('keeps the original relief, so landmarks and the player stand where they did', () => {
    const original = (x: number, z: number) =>
      3.2 * Math.sin(x * 0.045) * Math.cos(z * 0.037) +
      1.6 * Math.sin((x + z) * 0.11) +
      0.7 * Math.sin(x * 0.23 + 1.7) * Math.sin(z * 0.19);

    for (const [x, z] of [
      [-24, -18],
      [26, -14],
      [0, -30],
      [30, 0],
      [-60, 40],
    ] as const) {
      expect(terrainHeightAt(x, z)).toBeCloseTo(original(x, z), 9);
    }
  });

  it('evaluates exactly the relief table away from the plateau and the pond', () => {
    const [x, z] = [-70, 55];
    const expected = RELIEF.reduce(
      (sum, wave) =>
        sum +
        wave.amplitude *
          Math.sin(wave.a[0] * x + wave.a[1] * z + wave.a[2]) *
          (wave.b ? Math.sin(wave.b[0] * x + wave.b[1] * z + wave.b[2]) : 1),
      0,
    );

    expect(terrainHeightAt(x, z)).toBeCloseTo(expected, 10);
  });
});

describe('the pond', () => {
  it('holds water: its bed lies below the water line', () => {
    expect(terrainHeightAt(POND.x, POND.z)).toBeCloseTo(POND_WATER_LEVEL - POND.depth, 6);
  });

  it('is closed: the ground at and beyond its rim is never under water', () => {
    for (let ring = 1; ring <= 1.3 + 1e-9; ring += 0.05) {
      for (let i = 0; i < 96; i++) {
        const angle = (i / 96) * Math.PI * 2;
        const x = POND.x + Math.sin(angle) * POND.radius * ring;
        const z = POND.z + Math.cos(angle) * POND.radius * ring;
        expect(terrainHeightAt(x, z)).toBeGreaterThanOrEqual(POND_WATER_LEVEL - 1e-9);
      }
    }
  });

  it('stays well clear of the landmark ring', () => {
    expect(Math.hypot(POND.x, POND.z) - POND.radius * 1.4).toBeGreaterThan(RING_RADIUS + 8);
  });
});

describe('terrainGlsl', () => {
  it('defines the height function the grass shader calls', () => {
    expect(terrainGlsl()).toContain('float terrainHeight(vec2 p)');
  });

  it('is generated from the same tables as terrainHeightAt', () => {
    const glsl = terrainGlsl();

    for (const wave of RELIEF) {
      expect(glsl).toContain(wave.amplitude.toFixed(6));
    }
    expect(glsl).toContain(POND_WATER_LEVEL.toFixed(6));
    expect(glsl).toContain(POND.x.toFixed(6));
    expect(glsl).toContain(TERRAIN_FLAT_RADIUS.toFixed(6));
  });
});

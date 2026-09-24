import {
  Color,
  Mesh,
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { stubContext } from '@engine/testing/world-context';
import { Backdrop, HillRing, crestHeight } from './backdrop';

const NEAR: HillRing = {
  radius: 170,
  depth: 80,
  height: 22,
  roughness: 0.3,
  color: 0x6f8f5a,
  haze: 0.45,
  seed: 1,
};
const FAR: HillRing = {
  radius: 250,
  depth: 90,
  height: 40,
  roughness: 0.7,
  color: 0x7f95a8,
  haze: 1,
  seed: 2,
};

describe('Backdrop', () => {
  it('adds one unfogged mesh per ring', () => {
    const ctx = stubContext();
    new Backdrop([NEAR, FAR], 0xf0d3ae).init(ctx);

    expect(ctx.scene.children.length).toBe(2);
    for (const child of ctx.scene.children) {
      expect(((child as Mesh).material as MeshStandardMaterial).fog).toBe(false);
    }
  });

  it('keeps every vertex within the ring’s footprint', () => {
    const ctx = stubContext();
    new Backdrop([NEAR], 0xf0d3ae).init(ctx);
    const position = (ctx.scene.children[0] as Mesh).geometry.getAttribute('position');

    for (let i = 0; i < position.count; i++) {
      const distance = Math.hypot(position.getX(i), position.getZ(i));
      expect(distance).toBeGreaterThanOrEqual(NEAR.radius - NEAR.depth / 2 - 0.01);
      expect(distance).toBeLessThanOrEqual(NEAR.radius + NEAR.depth / 2 + 0.01);
      expect(position.getY(i)).toBeLessThanOrEqual(NEAR.height + 1e-6);
    }
  });

  it('never raises a crest above the ring’s height, and meets itself all the way round', () => {
    for (let i = 0; i <= 360; i++) {
      expect(crestHeight(FAR, (i / 360) * Math.PI * 2)).toBeLessThanOrEqual(FAR.height);
    }
    expect(crestHeight(FAR, 0)).toBeCloseTo(crestHeight(FAR, Math.PI * 2), 9);
  });

  it('fades a fully hazed ring into the horizon colour', () => {
    const ctx = stubContext();
    new Backdrop([FAR], 0xf0d3ae).init(ctx);
    const colour = (ctx.scene.children[0] as Mesh).geometry.getAttribute('color');
    const horizon = new Color(0xf0d3ae);

    expect(colour.getX(0)).toBeCloseTo(horizon.r, 5);
    expect(colour.getY(0)).toBeCloseTo(horizon.g, 5);
    expect(colour.getZ(0)).toBeCloseTo(horizon.b, 5);
  });

  it('mixes every ring towards one shared airlight, which starts as the horizon', () => {
    const ctx = stubContext();
    const backdrop = new Backdrop([NEAR, FAR], 0xf0d3ae);
    backdrop.init(ctx);

    expect(backdrop.airlight.value.getHex()).toBe(0xf0d3ae);
    for (const child of ctx.scene.children) {
      const shader = {
        vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader,
        uniforms: {},
        defines: {},
      } as unknown as WebGLProgramParametersWithUniforms;
      ((child as Mesh).material as MeshStandardMaterial).onBeforeCompile(
        shader,
        {} as WebGLRenderer,
      );
      expect(shader.uniforms['backdropHorizon']).toBe(backdrop.airlight);
    }
  });

  it('takes everything back out when disposed', () => {
    const ctx = stubContext();
    const backdrop = new Backdrop([NEAR, FAR], 0xf0d3ae);
    backdrop.init(ctx);

    backdrop.dispose();

    expect(ctx.scene.children).toEqual([]);
  });
});

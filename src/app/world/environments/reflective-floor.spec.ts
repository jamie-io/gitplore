import { AdditiveBlending, Mesh, ShaderMaterial } from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { QualityTier, qualitySettings } from '@engine/capability.service';
import { stubContext } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { ReflectiveFloor } from './reflective-floor';

function context(tier: QualityTier): WorldContext {
  return { ...stubContext(), quality: qualitySettings(tier) };
}

const floor = () => new ReflectiveFloor({ size: 40, strength: 0.5, roughness: 0.3 });

describe('ReflectiveFloor', () => {
  for (const tier of ['low', 'medium'] as const) {
    it(`adds nothing on the ${tier} tier`, () => {
      const ctx = context(tier);
      const reflective = floor();
      reflective.init(ctx);

      expect(ctx.scene.children.length).toBe(0);
      reflective.dispose();
    });
  }

  it('lays one additive reflector just above the floor on the high tier', () => {
    const ctx = context('high');
    const reflective = floor();
    reflective.init(ctx);

    expect(ctx.scene.children.length).toBe(1);
    const mesh = ctx.scene.children[0];
    expect(mesh).toBeInstanceOf(Reflector);
    expect(mesh.position.y).toBeGreaterThan(0);
    expect(mesh.position.y).toBeLessThanOrEqual(0.02);
    const material = (mesh as Mesh).material as ShaderMaterial;
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.uniforms['strength'].value).toBe(0.5);
    expect(material.uniforms['roughness'].value).toBe(0.3);
    expect(material.fragmentShader).toContain('fresnel');
    reflective.dispose();
  });

  it('frees its render target through the reflector and empties the scene', () => {
    const ctx = context('high');
    const reflective = floor();
    reflective.init(ctx);
    const reflector = ctx.scene.children[0] as Reflector;
    const dispose = vi.spyOn(reflector, 'dispose');
    const target = vi.spyOn(reflector.getRenderTarget(), 'dispose');

    reflective.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(target).toHaveBeenCalledTimes(1);
    expect(ctx.scene.children.length).toBe(0);
  });
});

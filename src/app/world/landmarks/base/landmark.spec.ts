import { PerspectiveCamera, Scene } from 'three';
import { HeightField } from '@engine/player/collision';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import type { Project } from '@content/project.model';
import { Landmark, LandmarkOptions, LandmarkShape } from './landmark';

const flatGround: HeightField = { heightAt: () => 0 };

const baseProject: Project = {
  slug: 'test-project',
  title: 'Test Project',
  summary: 'A project used only to exercise the base Landmark class.',
  tags: ['Test'],
  repoUrl: 'https://github.com/jamie-io/test-project',
  demo: { kind: 'none' },
  landmark: { kind: 'portal' },
  theme: { primary: '#333333', accent: '#eeeeee' },
};

/** Minimal concrete landmark: no geometry, no colliders, no interactables. */
class TestLandmark extends Landmark {
  protected describe(): LandmarkShape {
    return { colliders: [], interactables: [] };
  }

  protected build(): void {
    // No meshes; this subclass only exists to exercise the base class placement logic.
  }
}

function context(): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
    assets: new StubAssets(),
  };
}

function options(overrides: Partial<LandmarkOptions> = {}): LandmarkOptions {
  return {
    project: baseProject,
    placement: { position: [0, 0, 0], rotationY: 0 },
    ground: flatGround,
    reducedMotion: () => false,
    onEnter: () => undefined,
    ...overrides,
  };
}

describe('Landmark', () => {
  it('takes its position from the placement the scene resolved, not from the project', () => {
    const project = { ...baseProject, landmark: { kind: 'portal' as const } };

    const landmark = new TestLandmark({
      project,
      placement: { position: [4, 0, -6], rotationY: 1.5 },
      ground: flatGround,
      reducedMotion: () => false,
      onEnter: () => undefined,
    });

    expect(landmark.position.x).toBe(4);
    expect(landmark.position.z).toBe(-6);
    expect(landmark.rotationY).toBe(1.5);
  });

  it('adds its meshes to the scene on init and removes them on dispose', () => {
    const ctx = context();
    const landmark = new TestLandmark(options());

    landmark.init(ctx);
    expect(ctx.scene.children).toContain(landmark.group);

    landmark.dispose();
    expect(ctx.scene.children).not.toContain(landmark.group);
  });
});

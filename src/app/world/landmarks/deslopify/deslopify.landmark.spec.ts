import { Mesh, PerspectiveCamera, Scene } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECTS } from '@content/projects';
import { LandmarkOptions } from '../base/landmark';
import { EXAMPLE_VIDEOS, DeslopifyLandmark } from './deslopify.landmark';

function options(overrides: Partial<LandmarkOptions> = {}): LandmarkOptions {
  return {
    project: PROJECTS.find((p) => p.slug === 'deslopify')!,
    ground: { heightAt: () => 0 },
    reducedMotion: () => true,
    onEnter: () => undefined,
    onDemo: () => undefined,
    ...overrides,
  };
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

describe('DeslopifyLandmark', () => {
  it('keeps the portal into the project and adds a demo interactable', () => {
    const landmark = new DeslopifyLandmark(options());

    const prompts = landmark.interactables.map((i) => i.prompt);
    expect(prompts).toContain('Deslopify betreten');
    expect(prompts.some((p) => /ausprobieren/.test(p))).toBe(true);
  });

  it('asks the page to start the demo when the video wall is used', () => {
    const started: string[] = [];
    const landmark = new DeslopifyLandmark(options({ onDemo: (l) => started.push(l.id) }));
    landmark.init(context());

    landmark.interactables.find((i) => /ausprobieren/.test(i.prompt))!.onInteract();

    expect(started).toEqual(['landmark:deslopify']);
  });

  it('builds one card per example video', () => {
    const ctx = context();
    const landmark = new DeslopifyLandmark(options());

    landmark.init(ctx);

    const cards = landmark.group.children.filter((child) => child.name.startsWith('card:'));
    expect(cards.length).toBe(EXAMPLE_VIDEOS.length);
  });

  it('starts showing the mistranslated titles and flips them on interact', () => {
    const ctx = context();
    const landmark = new DeslopifyLandmark(options());
    landmark.init(ctx);

    expect(landmark.showingOriginals).toBe(false);
    landmark.enter();
    landmark.interact();

    expect(landmark.showingOriginals).toBe(true);
    landmark.interact();
    expect(landmark.showingOriginals).toBe(false);
  });

  it('places the player in front of the wall on enter and tells them what to press', () => {
    const ctx = context();
    const landmark = new DeslopifyLandmark(options());
    landmark.init(ctx);
    const before = ctx.player.position.clone();

    landmark.enter();

    expect(ctx.player.position.equals(before)).toBe(false);
    expect(landmark.demoHint).toMatch(/E/);
    expect(landmark.demoHint).toMatch(/Esc/);
  });

  it('shows the mistranslations again after exit, ready for the next visitor', () => {
    const ctx = context();
    const landmark = new DeslopifyLandmark(options());
    landmark.init(ctx);
    landmark.enter();
    landmark.interact();

    landmark.exit();

    expect(landmark.showingOriginals).toBe(false);
  });

  it('adds the wall to the things the player bumps into', () => {
    const landmark = new DeslopifyLandmark(options());

    expect(landmark.colliders.length).toBeGreaterThan(2);
  });

  it('is what createLandmark builds for the deslopify kind', async () => {
    const { createLandmark } = await import('../create-landmark');
    const built = createLandmark({
      ...options(),
      project: {
        ...options().project,
        landmark: { ...options().project.landmark, kind: 'deslopify' },
      },
    });

    expect(built).toBeInstanceOf(DeslopifyLandmark);
  });

  it('disposes its cards with the rest', () => {
    const ctx = context();
    const landmark = new DeslopifyLandmark(options());
    landmark.init(ctx);
    const card = landmark.group.children.find((c) => c.name.startsWith('card:')) as Mesh;

    landmark.dispose();

    expect(ctx.scene.children).not.toContain(landmark.group);
    expect(card.parent).toBeNull();
  });
});

import { Texture } from 'three';
import { stubContext } from '@engine/testing/world-context';
import type { Project } from '@content/project.model';
import { ShowroomEnvironment } from '../../environments/showroom';
import { WebkatalogScene } from './webkatalog.scene';

/**
 * Local rather than added to `PROJECT_FIXTURES`: that list is deliberately frozen at three entries
 * and `project-menu.spec.ts` counts them.
 */
const PROJECT: Project = {
  slug: 'webkatalog_demoshop',
  title: 'Nordwerk – Demoshop für den 3D office WebKatalog',
  summary: 'Vollständiger B2B-Möbelshop eines fiktiven Fachhändlers.',
  tags: ['JavaScript', 'ES Modules'],
  repoUrl: 'https://github.com/jamie-io/webkatalog_demoshop',
  year: 2026,
  readme: { kind: 'bundled', path: 'content/readme/webkatalog_demoshop.md' },
  demo: { kind: 'none' },
  landmark: { kind: 'portal' },
  environment: 'showroom',
  theme: { primary: '#8f6a2f', accent: '#f6f0ea' },
};

function scene(): WebkatalogScene {
  return new WebkatalogScene({
    environment: new ShowroomEnvironment({ reducedMotion: () => true }),
    project: PROJECT,
    reducedMotion: () => true,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    textures: { load: () => new Texture(), release: () => undefined },
  });
}

describe('WebkatalogScene', () => {
  it('offers the configurator alongside the exhibit and the way back', () => {
    const prompts = scene().interactables.map((interactable) => interactable.prompt);

    expect(prompts).toContain('Material wechseln');
    expect(prompts.some((prompt) => prompt.startsWith('Zurück'))).toBe(true);
  });

  it('stands the bays and the counter on opposite sides of the exhibit', () => {
    const target = scene();
    const exhibitX = target.bays.positions[0].x;

    expect(target.bays.positions.length).toBeGreaterThan(1);
    expect(Math.sign(target.counter.position.x - exhibitX)).not.toBe(0);
  });

  it('blocks the furniture as well as the hall', () => {
    const plain = new ShowroomEnvironment({ reducedMotion: () => true }).colliders.length;

    expect(scene().colliders.length).toBeGreaterThan(plain + 1);
  });

  it('reconfigures the desk from the world, not the panel', () => {
    const target = scene();
    target.init(stubContext());
    const before = target.bays.material.label;

    target.bays.configure();

    expect(target.bays.material.label).not.toBe(before);
  });

  it('empties the scene graph when disposed', () => {
    const ctx = stubContext();
    const target = scene();

    target.init(ctx);
    const built = ctx.scene.children.length;
    target.dispose();

    expect(built).toBeGreaterThan(0);
    expect(ctx.scene.children.length).toBe(0);
  });
});

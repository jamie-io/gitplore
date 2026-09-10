import { existsSync } from 'node:fs';
import { PROJECTS } from './projects';
import { Project } from './project.model';

const PUBLIC_DIR = 'public/';

describe('projects.ts schema', () => {
  it('lists at least the three featured projects', () => {
    expect(PROJECTS.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every project a unique slug', () => {
    const slugs = PROJECTS.map((project) => project.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses url-safe slugs', () => {
    for (const project of PROJECTS) {
      expect(project.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('describes every project with a title, summary and tags', () => {
    for (const project of PROJECTS) {
      expect(project.title.length).toBeGreaterThan(0);
      expect(project.summary.length).toBeGreaterThan(20);
      expect(project.tags.length).toBeGreaterThan(0);
    }
  });

  it('points every project at a real repository url', () => {
    for (const project of PROJECTS) {
      expect(project.repoUrl).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it('bundles a README path that matches the slug', () => {
    for (const project of PROJECTS) {
      if (project.readme?.kind === 'bundled') {
        expect(project.readme.path).toBe(`content/readme/${project.slug}.md`);
      }
    }
  });

  it('ships the README file every bundled project promises', () => {
    for (const project of PROJECTS) {
      if (project.readme?.kind === 'bundled') {
        expect(existsSync(PUBLIC_DIR + project.readme.path)).toBe(true);
      }
    }
  });

  it('ships the screenshot every iframe demo promises', () => {
    for (const project of PROJECTS) {
      if (project.demo.kind === 'iframe') {
        expect(existsSync(PUBLIC_DIR + project.demo.screenshot)).toBe(true);
      }
    }
  });

  it('only embeds demos over https', () => {
    for (const project of PROJECTS) {
      if (project.demo.kind === 'iframe') {
        expect(project.demo.url.startsWith('https://')).toBe(true);
      }
    }
  });

  it('keeps the demo union valid', () => {
    for (const project of PROJECTS) {
      const demo: Project['demo'] = project.demo;
      switch (demo.kind) {
        case 'iframe':
          expect(typeof demo.embeddable).toBe('boolean');
          expect(demo.screenshot.length).toBeGreaterThan(0);
          break;
        case 'custom':
          expect(['in-world', 'panel']).toContain(demo.mode);
          break;
        case 'none':
          break;
        default:
          throw new Error(`unknown demo kind on ${project.slug}`);
      }
    }
  });

  it('places every landmark away from the spawn plateau', () => {
    for (const project of PROJECTS) {
      // The curated portfolio always gives its landmarks an explicit position (see project.model.ts).
      const position = project.landmark.position;
      expect(position).toBeDefined();
      if (!position) continue;
      const [x, , z] = position;
      expect(Math.hypot(x, z)).toBeGreaterThan(14);
    }
  });

  it('does not stack two landmarks on the same spot', () => {
    const seen = new Set(PROJECTS.map((p) => p.landmark.position?.join(',') ?? p.slug));

    expect(seen.size).toBe(PROJECTS.length);
  });

  it('gives every project a theme colour pair', () => {
    for (const project of PROJECTS) {
      expect(project.theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(project.theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

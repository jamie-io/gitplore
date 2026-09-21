import { TestBed } from '@angular/core/testing';
import { CanvasTexture, Mesh, MeshBasicMaterial, Texture, Vector3 } from 'three';
import type { InputAction, InputActionSource } from '@engine/input.service';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { stubContext } from '@engine/testing/world-context';
import type { Project } from '@content/project.model';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import {
  buildTerminalPages,
  Terminal,
  TERMINAL_PROMPT,
  TERMINAL_LINES_PER_PAGE,
  TERMINAL_RELEASE_PROMPT,
  terminalFooter,
  wrapLine,
} from './terminal';

const PROJECT: Project = {
  ...PROJECT_FIXTURES[0],
  languages: { TypeScript: 900, JavaScript: 100, Empty: 0 },
  commitBuckets: Array.from({ length: 52 }, (_, index) => (index === 4 ? 2 : index === 51 ? 3 : 0)),
  firstCommitAt: '2026-01-02T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  pushedAt: '2026-01-10T00:00:00Z',
  releases: [{ name: 'v1.0.0', date: '2026-01-04T00:00:00Z' }],
  stars: 4,
  forks: 2,
  openIssues: 1,
  license: 'MIT',
};

class FakeInput implements InputActionSource {
  capturedPrompt: string | undefined;
  private readonly captureListeners = new Set<(captured: boolean, prompt: string | null) => void>();
  private readonly actionListeners = new Set<(action: InputAction) => void>();

  capture(prompt?: string): void {
    this.capturedPrompt = prompt;
    this.captureListeners.forEach((listener) => listener(true, prompt ?? null));
  }

  releaseCapture(): void {
    this.capturedPrompt = undefined;
    this.captureListeners.forEach((listener) => listener(false, null));
  }

  addCaptureListener(listener: (captured: boolean, prompt: string | null) => void): () => void {
    this.captureListeners.add(listener);
    return () => this.captureListeners.delete(listener);
  }

  addActionListener(listener: (action: InputAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  emit(action: InputAction): void {
    this.actionListeners.forEach((listener) => listener(action));
  }
}

const ground = { heightAt: () => 0 };

describe('buildTerminalPages', () => {
  it('renders every synced repository field with project-page German wording', () => {
    const text = buildTerminalPages(PROJECT)
      .flatMap((page) => [page.title, ...page.lines])
      .join('\n');

    expect(text).toContain('Phönix Industriedienstleistungen');
    expect(text).toContain('TypeScript: 900 Bytes (90,0 %)');
    expect(text).toContain('JavaScript: 100 Bytes (10,0 %)');
    expect(text).toContain('5 Commits im Zeitraum vom 1. Januar 2026 bis 10. Januar 2026.');
    expect(text).toContain(
      'Verteilt auf 2 von 52 Zeitabschnitten; stärkster Zeitabschnitt: 3 Commits.',
    );
    expect(text).toContain('v1.0.0 · 4. Januar 2026');
    expect(text).toContain('Sterne: 4');
    expect(text).toContain('Forks: 2');
    expect(text).toContain('Offene Issues: 1');
    expect(text).toContain('Lizenz: MIT');
    expect(text).toContain('Erstellt: 1. Januar 2026');
    expect(text).toContain('Erster Commit: 2. Januar 2026');
    expect(text).toContain('Letzter Push: 10. Januar 2026');
  });

  it('gives each subject its own page, in a fixed order, starting with the project', () => {
    const pages = buildTerminalPages(PROJECT);

    expect(pages.map((page) => page.title)).toEqual([
      'Projekt',
      'Sprachen',
      'Commit-Aktivität',
      'Veröffentlichungen',
      'Kennzahlen',
    ]);
    expect(pages[0].lines).toEqual([PROJECT.title, PROJECT.summary, PROJECT.repoUrl]);
  });

  it('runs a long section on over several pages rather than cutting it', () => {
    const languages = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [`Sprache${index}`, 100 - index]),
    );
    const pages = buildTerminalPages({ ...PROJECT, languages });
    const languagePages = pages.filter((page) => page.title === 'Sprachen');

    expect(languagePages.map((page) => page.lines.length)).toEqual([
      TERMINAL_LINES_PER_PAGE,
      TERMINAL_LINES_PER_PAGE,
      18 - 2 * TERMINAL_LINES_PER_PAGE,
    ]);
    expect(languagePages.flatMap((page) => page.lines)).toHaveLength(18);
  });

  it('omits missing, empty and zero repository values', () => {
    const project: Project = {
      ...PROJECT,
      languages: { TypeScript: 0 },
      commitBuckets: Array(52).fill(0),
      firstCommitAt: undefined,
      createdAt: undefined,
      pushedAt: undefined,
      releases: [],
      stars: 0,
      forks: 0,
      openIssues: 0,
      license: null,
    };
    const text = buildTerminalPages(project)
      .flatMap((page) => [page.title, ...page.lines])
      .join('\n');

    expect(text).toContain(project.title);
    expect(text).not.toContain('TypeScript');
    expect(text).not.toContain('Commits');
    expect(text).not.toContain('Veröffentlichungen');
    expect(text).not.toContain('Sterne');
    expect(text).not.toContain('Forks');
    expect(text).not.toContain('Offene Issues');
    expect(text).not.toContain('Lizenz');
    expect(text).not.toContain('Erstellt');
    expect(text).not.toContain('Erster Commit');
    expect(text).not.toContain('Letzter Push');
    expect(buildTerminalPages(project).map((page) => page.title)).toEqual(['Projekt']);
  });
});

describe('Terminal', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('captures controls, pages with arrows, and releases on capture end', () => {
    const input = new FakeInput();
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      input,
    });

    expect(target.interactables[0].prompt).toBe(TERMINAL_PROMPT);
    expect(TERMINAL_PROMPT).toBe('Terminal bedienen');
    input.emit('down');
    expect(target.pageIndex, 'arrows page only while the terminal holds the controls').toBe(0);

    target.interactables[0].onInteract();
    expect(input.capturedPrompt).toBe(TERMINAL_RELEASE_PROMPT);
    expect(TERMINAL_RELEASE_PROMPT).toBe('Terminal verlassen');
    expect(target.active).toBe(true);
    expect(target.pageIndex).toBe(0);

    input.emit('down');
    expect(target.pageIndex).toBe(1);
    input.emit('up');
    input.emit('up');
    expect(target.pageIndex).toBe(target.pages.length - 1);
    input.emit('interact');
    expect(target.pageIndex).toBe(target.pages.length - 1);

    // `InputService` turns E and Escape into a released capture.
    input.releaseCapture();
    expect(target.active).toBe(false);
    input.emit('down');
    expect(target.pageIndex).toBe(target.pages.length - 1);

    // The next visit starts on the first page again.
    target.interactables[0].onInteract();
    expect(target.pageIndex).toBe(0);

    target.dispose();
  });

  it('steps the visitor square in front of the screen when it takes the controls', () => {
    const input = new FakeInput();
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(4, 0, -2),
      rotationY: Math.PI / 2,
      ground,
      project: PROJECT,
      input,
    });
    const ctx = stubContext();
    target.init(ctx);

    target.interactables[0].onInteract();

    // Facing +X, so the visitor stands on +X of it and looks back along −X.
    expect(ctx.player.position.x).toBeCloseTo(4 + 2.3, 5);
    expect(ctx.player.position.z).toBeCloseTo(-2, 5);
    expect(ctx.player.position.y).toBeCloseTo(PLAYER_EYE_HEIGHT, 5);
    expect(ctx.player.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(target.reading.distanceTo(ctx.player.position)).toBeCloseTo(0, 5);
    target.dispose();
  });

  it('hands the controls back when the world goes while it is in use', () => {
    const input = new FakeInput();
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      input,
    });
    target.interactables[0].onInteract();

    target.dispose();

    expect(input.capturedPrompt).toBeUndefined();
    input.emit('down');
    expect(target.pageIndex).toBe(0);
  });

  it('survives a missing jsdom canvas context', () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
    });
    const ctx = stubContext();

    expect(() => target.init(ctx)).not.toThrow();
    expect(ctx.scene.children.length).toBeGreaterThan(0);

    target.dispose();
    expect(ctx.scene.children).toHaveLength(0);
    context.mockRestore();
  });

  it('disposes its canvas texture with the terminal', () => {
    const canvasContext = {
      fillStyle: '',
      fillRect: vi.fn(),
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillText: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 14 }),
    } as unknown as CanvasRenderingContext2D;
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
    });
    const ctx = stubContext();

    target.init(ctx);
    const screen = ctx.scene.getObjectByName('test:terminal:screen') as Mesh;
    const texture = (screen.material as MeshBasicMaterial).map as Texture;
    expect(texture).toBeInstanceOf(CanvasTexture);
    const dispose = vi.spyOn(texture, 'dispose');

    target.dispose();

    expect(dispose).toHaveBeenCalledOnce();
    expect((screen.material as MeshBasicMaterial).map).toBe(texture);
    expect(ctx.scene.children).toHaveLength(0);
    context.mockRestore();
  });
});

describe('the terminal screen', () => {
  it('draws once when built and once per page change, never per frame', () => {
    const fillRect = vi.fn();
    const canvasContext = {
      fillStyle: '',
      fillRect,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillText: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 14 }),
    } as unknown as CanvasRenderingContext2D;
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const input = new FakeInput();
    const target = new Terminal({
      id: 'test:terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      input,
    });
    const ctx = stubContext();
    target.init(ctx);
    const texture = (
      (ctx.scene.getObjectByName('test:terminal:screen') as Mesh).material as MeshBasicMaterial
    ).map as CanvasTexture;
    const drawn = () => fillRect.mock.calls.filter(([x, y]) => x === 0 && y === 0).length;
    expect(drawn()).toBe(1);
    const version = texture.version;

    for (let frame = 0; frame < 60; frame++) {
      target.update();
    }
    expect(drawn()).toBe(1);
    expect(texture.version).toBe(version);

    target.interactables[0].onInteract();
    input.emit('down');
    expect(drawn()).toBe(2);
    expect(texture.version).toBe(version + 1);

    target.dispose();
    context.mockRestore();
  });

  it('wraps long sentences at spaces and numbers the pages in German', () => {
    const measure = (text: string) => text.length;

    expect(wrapLine('eins zwei drei vier', 9, measure)).toEqual(['eins zwei', 'drei vier']);
    expect(wrapLine('Donaudampfschifffahrt kurz', 5, measure)).toEqual([
      'Donaudampfschifffahrt',
      'kurz',
    ]);
    expect(terminalFooter(1, 4)).toBe('Seite 2 von 4 · ↑ ↓ blättern · E oder Esc: verlassen');
  });
});

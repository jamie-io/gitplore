import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from 'three';
import type { InputAction, InputActionSource } from '@engine/input.service';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { StubAssets, stubContext } from '@engine/testing/world-context';
import type { Project } from '@content/project.model';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { markerPosition } from '../model-geometry';
import { DSCHUNGEL, PLAZA } from '../mood';
import { ModelFiles, loadModelFile } from '../testing/model-files';
import { HazedCopies } from '../shaders/hazed-copies';
import { SharedUniforms } from '../shaders/shared-uniforms';
import {
  buildTerminalPages,
  Terminal,
  TERMINAL_PROMPT,
  TERMINAL_LINES_PER_PAGE,
  TERMINAL_RELEASE_PROMPT,
  STELE_MODEL,
  PLAZA_TERMINAL_MODEL,
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

  it('renders the jungle terminal as a compact stone stele', () => {
    const fillRect = vi.fn();
    const beginPath = vi.fn();
    const arc = vi.fn();
    const fill = vi.fn();
    const stroke = vi.fn();
    const roundRect = vi.fn();
    const drawFonts: string[] = [];
    let currentFont = '';
    const fillText = vi.fn((text: string, _x?: number, _y?: number) => {
      void text;
      void _x;
      void _y;
      drawFonts.push(currentFont);
    });
    const fonts: string[] = [];
    const canvasContext = {
      fillStyle: '',
      fillRect,
      beginPath,
      arc,
      fill,
      stroke,
      roundRect,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillText,
      measureText: (text: string) => ({ width: text.length * 14 }),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvasContext, 'font', {
      configurable: true,
      get: () => currentFont,
      set: (value: string) => {
        currentFont = value;
        fonts.push(value);
      },
    });
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const input = new FakeInput();
    const target = new Terminal({
      id: 'test:jungle-terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: { ...PROJECT, summary: 'langes '.repeat(160) },
      skin: 'jungle',
      input,
    });
    const ctx = stubContext();

    target.init(ctx);

    const body = ctx.scene.getObjectByName('test:jungle-terminal:body') as Mesh;
    const screen = ctx.scene.getObjectByName('test:jungle-terminal:screen') as Mesh;
    const terminalGroup = ctx.scene.getObjectByName('test:jungle-terminal') as Group;
    const panel = ctx.scene.getObjectByName('test:jungle-terminal:panel') as Group;
    const slab = ctx.scene.getObjectByName('test:jungle-terminal:slab') as Mesh;
    const label = ctx.scene.getObjectByName('test:jungle-terminal:label') as Mesh;
    const bodyParameters = (
      body.geometry as unknown as { parameters: { width: number; height: number } }
    ).parameters;
    const screenParameters = (
      screen.geometry as unknown as { parameters: { width: number; height: number } }
    ).parameters;
    const slabParameters = (
      slab.geometry as unknown as {
        parameters: { height: number; radiusTop: number; radiusBottom: number };
      }
    ).parameters;
    const labelParameters = (
      label.geometry as unknown as { parameters: { width: number; height: number } }
    ).parameters;
    const plank = ctx.scene.getObjectByName('test:jungle-terminal:plank') as Mesh;
    const plankParameters = (
      plank.geometry as unknown as { parameters: { width: number; height: number } }
    ).parameters;
    const bodyLineFonts = drawFonts.filter(
      (font) => font === '44px "IBM Plex Sans", system-ui, sans-serif',
    );

    expect((screen.material as MeshBasicMaterial).map?.image).toMatchObject({
      width: 1024,
      height: 640,
    });
    const slabMaterial = slab.material as MeshStandardMaterial;
    const bodyMaterial = body.material as MeshStandardMaterial;
    expect(bodyParameters.width).toBeCloseTo(1.69, 6);
    expect(bodyParameters.height).toBeCloseTo(1.09, 6);
    expect(screenParameters.width).toBeCloseTo(1.6, 6);
    expect(screenParameters.height).toBeCloseTo(1, 6);
    expect(slab.position.y).toBeCloseTo(2.75 / 2, 6);
    expect(slabParameters.height).toBeCloseTo(2.75, 6);
    expect(slab.position.y - slabParameters.height / 2).toBeCloseTo(0, 6);
    expect(slabParameters.radiusBottom).toBeGreaterThan(slabParameters.radiusTop);
    expect(slabMaterial.color.getHex()).toBe(0x3a4038);
    expect(slabMaterial.roughness).toBe(1);
    expect(slabMaterial.flatShading).toBe(false);
    expect(bodyMaterial.color.getHex()).toBe(0x141b17);
    expect(terminalGroup.rotation.x).toBe(0);
    expect(panel.position.y).toBeCloseTo(2.1, 6);
    expect(panel.rotation.x).toBeCloseTo(-Math.PI / 15, 6);
    expect(body.parent).toBe(panel);
    expect(screen.parent).toBe(panel);
    expect(ctx.scene.getObjectByName('test:jungle-terminal:post')).toBeUndefined();
    expect(target.colliders[0]).toMatchObject({
      kind: 'aabb',
      minX: -1.05,
      maxX: 1.05,
      maxZ: -1.72,
    });
    expect((target.colliders[0] as { readonly minZ: number }).minZ).toBeCloseTo(-2.28, 6);
    expect(label.scale.x).toBe(1);
    expect(label.scale.y).toBe(1);
    expect(plankParameters.width).toBeCloseTo(labelParameters.width + 0.2, 6);
    expect(plankParameters.height).toBeCloseTo(labelParameters.height + 0.12, 6);
    expect(fonts).toContain('44px "IBM Plex Sans", system-ui, sans-serif');
    expect(fonts).toContain('600 54px "IBM Plex Sans", system-ui, sans-serif');
    expect(fonts).toContain('500 26px "IBM Plex Mono", ui-monospace, monospace');
    expect(bodyLineFonts).toHaveLength(5);
    expect(fillText.mock.calls.some(([text, y]) => text === PROJECT.title && y === 60)).toBe(false);
    expect(fillText.mock.calls.some(([text]) => text === '↑↓')).toBe(true);
    expect(fillText.mock.calls.some(([text]) => text === 'blättern')).toBe(true);
    expect(fillText.mock.calls.some(([text]) => text === 'Esc')).toBe(true);
    expect(fillText.mock.calls.some(([text]) => text === 'verlassen')).toBe(true);
    expect(fillText.mock.calls.some(([text]) => String(text).startsWith('Seite '))).toBe(false);
    expect(arc.mock.calls.filter(([, , radius]) => radius === 4)).toHaveLength(target.pages.length);
    expect(roundRect).toHaveBeenCalledTimes(2);
    expect(stroke).toHaveBeenCalledTimes(2);

    target.interactables[0].onInteract();
    expect(target.reading.z).toBeCloseTo(-0.1, 6);
    expect(ctx.player.pitch).toBe(0);

    target.dispose();
    context.mockRestore();
  });

  it('replaces jungle stele slab and moss with its model and hazes model materials', async () => {
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
    const assets = new StubAssets();
    const haze = new HazedCopies(new SharedUniforms(DSCHUNGEL));
    const target = new Terminal({
      id: 'test:jungle-model',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'jungle',
      haze,
    });
    const ctx = stubContext(assets);
    const originalMaterial = new MeshStandardMaterial({ name: 'stele-stone' });
    const modelMesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), originalMaterial);
    const model = new Group();
    model.add(modelMesh);

    target.init(ctx);
    expect(assets.requested).toEqual([STELE_MODEL]);
    await assets.resolve(model);

    expect(ctx.scene.getObjectByName('test:jungle-model:slab')).toBeUndefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:moss-left')).toBeUndefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:moss-right')).toBeUndefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:moss-top')).toBeUndefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:stele')).toBe(model);
    expect(ctx.scene.getObjectByName('test:jungle-model:panel')).toBeDefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:plank')).toBeDefined();
    expect(ctx.scene.getObjectByName('test:jungle-model:label')).toBeDefined();
    expect(modelMesh.material).toBe(haze.of(originalMaterial));

    target.dispose();
    target.dispose();
    expect(assets.releasedModels).toEqual([STELE_MODEL]);
    context.mockRestore();
  });

  it('releases a stele model that arrives after dispose without adding it', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const assets = new StubAssets();
    const target = new Terminal({
      id: 'test:jungle-late-model',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'jungle',
    });
    target.init(stubContext(assets));
    target.dispose();

    const model = new Group();
    await assets.resolve(model);

    expect(assets.releasedModels).toEqual([STELE_MODEL]);
    expect(model.parent).toBeNull();
    context.mockRestore();
  });

  it('keeps default project header and does not load jungle fonts', () => {
    const fillText = vi.fn();
    const canvasContext = {
      fillStyle: '',
      fillRect: vi.fn(),
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillText,
      measureText: (text: string) => ({ width: text.length * 14 }),
    } as unknown as CanvasRenderingContext2D;
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const load = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load },
    });
    const target = new Terminal({
      id: 'test:default-terminal',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
    });
    const assets = new StubAssets();

    target.init(stubContext(assets));

    expect(fillText).toHaveBeenCalledWith(PROJECT.title, 48, 60, 928);
    expect(load).not.toHaveBeenCalled();
    expect(assets.requested).toEqual([]);
    target.dispose();
    context.mockRestore();
    delete (document as { fonts?: FontFaceSet }).fonts;
  });

  it('redraws jungle text after its fonts load', async () => {
    const fillRect = vi.fn();
    const canvasContext = {
      fillStyle: '',
      fillRect,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillText: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 14 }),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      roundRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load },
    });
    const target = new Terminal({
      id: 'test:jungle-fonts',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'jungle',
    });
    const ctx = stubContext();

    target.init(ctx);
    const clearCount = () =>
      fillRect.mock.calls.filter(
        ([x, y, width, height]) => x === 0 && y === 0 && width === 1024 && height === 640,
      ).length;
    expect(clearCount()).toBe(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(load).toHaveBeenCalledWith('44px "IBM Plex Sans", system-ui, sans-serif');
    expect(clearCount()).toBe(2);
    target.dispose();
    context.mockRestore();
    delete (document as { fonts?: FontFaceSet }).fonts;
  });

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

  it('dresses the Plaza terminal as the kiosk model around the default screen', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const read = (path: string) => readFileSync(path);
    const assets = new ModelFiles(read);
    const haze = new HazedCopies(new SharedUniforms(PLAZA));
    const target = new Terminal({
      id: 'test:plaza',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'plaza',
      haze,
    });
    const ctx = stubContext(assets);

    target.init(ctx);
    expect(assets.requested).toEqual([PLAZA_TERMINAL_MODEL]);
    expect(ctx.scene.getObjectByName('test:plaza:body')).toBeDefined();
    expect(ctx.scene.getObjectByName('test:plaza:post')).toBeDefined();
    await assets.settled();

    expect(ctx.scene.getObjectByName('test:plaza:body')).toBeUndefined();
    expect(ctx.scene.getObjectByName('test:plaza:post')).toBeUndefined();
    const kiosk = ctx.scene.getObjectByName('test:plaza:kiosk') as Mesh;
    expect(kiosk).toBeInstanceOf(Mesh);
    expect((kiosk.material as MeshStandardMaterial).customProgramCacheKey()).toContain(
      'atmosphere',
    );
    // The screen hangs where the kiosk's `screen` empty marks it.
    const model = await loadModelFile(read, `public/${PLAZA_TERMINAL_MODEL}`);
    const expected = markerPosition(model, 'screen')!;
    const screen = ctx.scene.getObjectByName('test:plaza:screen')!;
    expect(screen.position.x).toBeCloseTo(expected.x, 3);
    expect(screen.position.y).toBeCloseTo(expected.y, 3);
    expect(screen.position.z).toBeCloseTo(expected.z, 3);
    // The counter and the stone feet block, not only the case.
    const [collider] = target.colliders;
    expect(collider.kind).toBe('aabb');
    if (collider.kind === 'aabb') {
      expect(collider.maxX - collider.minX).toBeCloseTo(3.1, 6);
      expect(collider.maxZ - collider.minZ).toBeCloseTo(0.65, 6);
    }

    target.dispose();
    expect(assets.releasedModels).toEqual([PLAZA_TERMINAL_MODEL]);
    expect(ctx.scene.children).toHaveLength(0);
    haze.dispose();
    context.mockRestore();
  });

  it('keeps the Plaza terminal’s case when the kiosk fails, and hands back a late kiosk', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const read = (path: string) => readFileSync(path);
    const failing = new ModelFiles(read, () => true);
    const kept = new Terminal({
      id: 'test:plaza-failed',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'plaza',
    });
    const keptContext = stubContext(failing);
    kept.init(keptContext);
    await failing.settled();
    expect(keptContext.scene.getObjectByName('test:plaza-failed:body')).toBeDefined();
    expect(failing.releasedModels).toEqual([]);
    kept.dispose();

    const late = new ModelFiles(read);
    const gone = new Terminal({
      id: 'test:plaza-late',
      position: new Vector3(0, 0, -2),
      ground,
      project: PROJECT,
      skin: 'plaza',
    });
    const lateContext = stubContext(late);
    gone.init(lateContext);
    gone.dispose();
    await late.settled();
    expect(late.releasedModels).toEqual([PLAZA_TERMINAL_MODEL]);
    expect(lateContext.scene.children).toHaveLength(0);
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
    expect(canvasContext.fillText).toHaveBeenCalledWith(PROJECT.title, 48, 60, 928);
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

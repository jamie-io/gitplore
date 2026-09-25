import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Texture,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECT_FIXTURES as PROJECTS } from '@content/testing/project-fixtures';
import { TextureProvider } from './landmark';
import { ScreenLandmark, ScreenLandmarkOptions } from './screen.landmark';

class StubTextures implements TextureProvider {
  loaded: string[] = [];
  released: string[] = [];
  handedOut: Texture[] = [];
  load(url: string): Texture {
    this.loaded.push(url);
    const texture = new Texture();
    this.handedOut.push(texture);
    return texture;
  }
  release(url: string): void {
    this.released.push(url);
  }
}

function options(overrides: Partial<ScreenLandmarkOptions> = {}): ScreenLandmarkOptions {
  const target = overrides.project ?? PROJECTS.find((p) => p.slug === 'novaverta')!;
  return {
    project: target,
    placement: {
      position: target.landmark.position ?? [0, 0, 0],
      rotationY: target.landmark.rotationY ?? 0,
    },
    ground: { heightAt: () => 0 },
    reducedMotion: () => false,
    onEnter: () => undefined,
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

function posterContext() {
  const fillText = vi.fn();
  const canvasContext = {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    font: '',
    lineWidth: 1,
    strokeStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillText,
    measureText: (text: string) => ({ width: text.length * 8 }),
    scale: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { canvasContext, fillText };
}

describe('ScreenLandmark', () => {
  it('draws a project poster when its demo has no screenshot', () => {
    const textures = new StubTextures();
    const project = {
      ...PROJECTS.find((p) => p.slug === 'deslopify')!,
      landmark: { kind: 'screen' as const, position: [0, 0, 0] as const, rotationY: 0 },
    };
    const { canvasContext, fillText } = posterContext();
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const screen = new ScreenLandmark(
      options({
        project,
        textures,
        kicker: 'Projekt · Browser-Erweiterung',
        englishSummary:
          'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
        comparison: { without: 'Ohne', with: 'With' },
      }),
    );

    screen.init(context());

    const surface = screen.group.getObjectByName('surface') as Mesh;
    const texture = (surface.material as MeshBasicMaterial).map as CanvasTexture;
    const written = fillText.mock.calls.map(([text]) => text as string);
    const posterText = written.join(' ');
    expect(textures.loaded).toEqual([]);
    expect(texture.image.width).toBe(1240);
    expect(texture.image.height).toBe(776);
    expect(written).toContain('PROJEKT · BROWSER-ERWEITERUNG');
    expect(written).toContain('Deslopify');
    expect(posterText).toContain(
      'Browser-Erweiterung, die von YouTube automatisch übersetzte Titel, Thumbnails, Beschreibungen und Tonspuren durch die Originale der Urheber ersetzt.',
    );
    expect(posterText).toContain(
      'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
    );
    expect(written).toContain('JavaScript');
    expect(written).toContain('Chrome Extension');
    expect(written).toContain('MV3');
    expect(written).toContain('github.com/jamie-io/deslopify');
    expect(written).toContain('E');
    expect(written).toContain('Details, README & Code');
    expect(written).toContain('OHNE · WITHOUT');
    expect(written).toContain('Ohne');
    expect(written).toContain('MIT · WITH');
    expect(written).toContain('With');

    canvas.mockRestore();
  });

  it('omits optional English copy and uses the plain kicker by default', () => {
    const { canvasContext, fillText } = posterContext();
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const project = {
      ...PROJECTS.find((p) => p.slug === 'deslopify')!,
      landmark: { kind: 'screen' as const, position: [0, 0, 0] as const, rotationY: 0 },
    };
    const screen = new ScreenLandmark(options({ project }));

    screen.init(context());

    const written = fillText.mock.calls.map(([text]) => text as string);
    expect(written).toContain('PROJEKT');
    expect(written).not.toContain('PROJEKT · BROWSER-ERWEITERUNG');
    expect(written.join(' ')).not.toContain(
      'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
    );

    canvas.mockRestore();
  });

  it('disposes the poster canvas texture with the screen', () => {
    const { canvasContext } = posterContext();
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
    const project = {
      ...PROJECTS.find((p) => p.slug === 'deslopify')!,
      landmark: { kind: 'screen' as const, position: [0, 0, 0] as const, rotationY: 0 },
    };
    const screen = new ScreenLandmark(options({ project }));

    screen.init(context());

    const surface = screen.group.getObjectByName('surface') as Mesh;
    const texture = (surface.material as MeshBasicMaterial).map as CanvasTexture;
    const dispose = vi.spyOn(texture, 'dispose');
    screen.dispose();

    expect(dispose).toHaveBeenCalledOnce();
    canvas.mockRestore();
  });

  it('shows the project screenshot on its screen', () => {
    const textures = new StubTextures();
    const screen = new ScreenLandmark(options({ textures }));

    screen.init(context());

    expect(textures.loaded).toEqual(['assets/screens/novaverta.webp']);
  });

  it('treats the screenshot as sRGB so it is not washed out on screen', () => {
    const textures = new StubTextures();
    const screen = new ScreenLandmark(options({ textures }));

    screen.init(context());

    expect(textures.handedOut[0].colorSpace).toBe(SRGBColorSpace);
  });

  it('gives the screenshot back when disposed', () => {
    const textures = new StubTextures();
    const screen = new ScreenLandmark(options({ textures }));
    screen.init(context());

    screen.dispose();

    expect(textures.released).toEqual(['assets/screens/novaverta.webp']);
  });

  it('is solid: the player cannot walk through the screen', () => {
    const screen = new ScreenLandmark(options({ textures: new StubTextures() }));
    const position = screen.project.landmark.position;
    expect(position).toBeDefined();
    if (!position) return;
    const [x, , z] = position;

    const box = screen.colliders[0];
    expect(box.kind).toBe('aabb');
    if (box.kind === 'aabb') {
      expect(x).toBeGreaterThan(box.minX);
      expect(x).toBeLessThan(box.maxX);
      expect(z).toBeGreaterThan(box.minZ);
      expect(z).toBeLessThan(box.maxZ);
    }
  });

  it('opens the project when used', () => {
    const entered: string[] = [];
    const screen = new ScreenLandmark(
      options({ textures: new StubTextures(), onEnter: (p) => entered.push(p.slug) }),
    );
    screen.init(context());

    screen.interactables[0].onInteract();

    expect(entered).toEqual(['novaverta']);
  });

  it('uses an optional prompt override while keeping the project title default', () => {
    const override = new ScreenLandmark(
      options({ textures: new StubTextures(), prompt: 'Details, README & Code' }),
    );
    const defaultPrompt = new ScreenLandmark(options({ textures: new StubTextures() }));

    expect(override.interactables[0]?.prompt).toBe('Details, README & Code');
    expect(defaultPrompt.interactables[0]?.prompt).toBe(`${defaultPrompt.project.title} ansehen`);
  });
});

describe('ScreenLandmark geometry', () => {
  it('keeps the post below the screen instead of through it', () => {
    const screen = new ScreenLandmark(options({ textures: new StubTextures() }));
    screen.init(context());

    const post = screen.group.getObjectByName('post') as Mesh;
    const body = screen.group.getObjectByName('body') as Mesh;
    const postTop = post.position.y + (post.geometry as CylinderGeometry).parameters.height / 2;
    const bodyBottom = body.position.y - (body.geometry as BoxGeometry).parameters.height / 2;

    expect(postTop).toBeLessThanOrEqual(bodyBottom + 0.01);
  });

  it('stands only its face and label when an environment frames it', () => {
    const ctx = context();
    const landmark = new ScreenLandmark(options({ frame: false }));
    landmark.init(ctx);

    expect(landmark.group.getObjectByName('post')).toBeUndefined();
    expect(landmark.group.getObjectByName('body')).toBeUndefined();
    const surface = landmark.group.getObjectByName('surface')!;
    // Where the frame's face expects it: 1.9 m up, 9 cm in front of the centre.
    expect(surface.position.y).toBeCloseTo(1.9, 6);
    expect(surface.position.z).toBeCloseTo(0.09, 6);
    expect(landmark.colliders).toHaveLength(1);
    landmark.dispose();
  });
});

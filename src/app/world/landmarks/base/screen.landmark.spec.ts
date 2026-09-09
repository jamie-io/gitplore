import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Texture,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECTS } from '@content/projects';
import { LandmarkOptions, TextureProvider } from './landmark';
import { ScreenLandmark } from './screen.landmark';

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

function options(overrides: Partial<LandmarkOptions> = {}): LandmarkOptions {
  return {
    project: PROJECTS.find((p) => p.slug === 'novaverta')!,
    ground: { heightAt: () => 0 },
    reducedMotion: false,
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
  };
}

describe('ScreenLandmark', () => {
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
    const [x, , z] = screen.project.landmark.position;

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
});

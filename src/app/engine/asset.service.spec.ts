import { TestBed } from '@angular/core/testing';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { AssetManifest, AssetService, GLTF_LOADER, TEXTURE_LOADER } from './asset.service';

/** Loaders are stubbed: the tests are about caching and refcounts, not about parsing files. */
class StubTextureLoader {
  loads: string[] = [];
  failing = new Set<string>();
  load(
    url: string,
    onLoad?: (texture: Texture) => void,
    _onProgress?: undefined,
    onError?: (error: unknown) => void,
  ): Texture {
    this.loads.push(url);
    const texture = new Texture();
    if (this.failing.has(url)) {
      onError?.(new Error('404'));
    } else {
      onLoad?.(texture);
    }
    return texture;
  }
}

class StubGltfLoader {
  loads: string[] = [];
  failing = new Set<string>();
  loadAsync(url: string): Promise<{ scene: Group }> {
    this.loads.push(url);
    if (this.failing.has(url)) {
      return Promise.reject(new Error('404'));
    }
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: new Texture() })));
    return Promise.resolve({ scene });
  }
}

const MANIFEST: AssetManifest = {
  assets: [
    { url: 'assets/models/monument.glb', bytes: 12_000, group: 'core' },
    { url: 'assets/models/arch.glb', bytes: 8_000, group: 'deslopify' },
    { url: 'assets/screens/novaverta.webp', bytes: 30_000, group: 'core' },
  ],
};

describe('AssetService', () => {
  let assets: AssetService;
  let textures: StubTextureLoader;
  let gltf: StubGltfLoader;

  beforeEach(() => {
    TestBed.resetTestingModule();
    textures = new StubTextureLoader();
    gltf = new StubGltfLoader();
    TestBed.configureTestingModule({
      providers: [
        { provide: TEXTURE_LOADER, useValue: textures },
        { provide: GLTF_LOADER, useValue: gltf },
      ],
    });
    assets = TestBed.inject(AssetService);
  });

  describe('textures', () => {
    it('loads a texture once and hands the same one to every consumer', () => {
      const first = assets.load('assets/screens/a.webp');
      const second = assets.load('assets/screens/a.webp');

      expect(second).toBe(first);
      expect(textures.loads).toEqual(['assets/screens/a.webp']);
    });

    it('marks textures as managed so the generic disposer leaves them alone', () => {
      expect(assets.load('assets/screens/a.webp').userData['managed']).toBe(true);
    });

    it('disposes a texture only when the last consumer releases it', () => {
      const texture = assets.load('assets/screens/a.webp');
      let disposed = 0;
      texture.dispose = () => void disposed++;
      assets.load('assets/screens/a.webp');

      assets.release('assets/screens/a.webp');
      expect(disposed).toBe(0);

      assets.release('assets/screens/a.webp');
      expect(disposed).toBe(1);
    });

    it('reloads after the last release rather than handing out a disposed texture', () => {
      const first = assets.load('assets/screens/a.webp');
      assets.release('assets/screens/a.webp');

      const again = assets.load('assets/screens/a.webp');

      expect(again).not.toBe(first);
      expect(textures.loads.length).toBe(2);
    });

    it('tolerates a release of something never loaded', () => {
      expect(() => assets.release('assets/nothing.webp')).not.toThrow();
    });
  });

  describe('models', () => {
    it('fetches a model once and gives each consumer its own copy of the scene', async () => {
      const a = await assets.model('assets/models/monument.glb');
      const b = await assets.model('assets/models/monument.glb');

      expect(gltf.loads).toEqual(['assets/models/monument.glb']);
      expect(a).not.toBe(b);
      expect(a.children.length).toBe(1);
    });

    it('shares the parsed source while at least one copy is out', async () => {
      const a = await assets.model('assets/models/monument.glb');
      await assets.model('assets/models/monument.glb');
      assets.releaseModel('assets/models/monument.glb');
      await assets.model('assets/models/monument.glb');

      expect(gltf.loads.length).toBe(1);
      expect(a.children.length).toBe(1);
    });

    it('marks the shared geometry, material and textures as managed', async () => {
      const copy = await assets.model('assets/models/monument.glb');

      const mesh = copy.children[0] as Mesh;
      expect(mesh.geometry.userData['managed']).toBe(true);
      expect((mesh.material as MeshStandardMaterial).userData['managed']).toBe(true);
      expect((mesh.material as MeshStandardMaterial).map?.userData['managed']).toBe(true);
    });

    it('rejects a copy when the file cannot be loaded, and retries on the next request', async () => {
      gltf.failing.add('assets/models/broken.glb');

      await expect(assets.model('assets/models/broken.glb')).rejects.toThrow('404');
      gltf.failing.delete('assets/models/broken.glb');
      await expect(assets.model('assets/models/broken.glb')).resolves.toBeInstanceOf(Group);
    });

    it('forgets the parsed source after the last copy is released', async () => {
      await assets.model('assets/models/monument.glb');
      assets.releaseModel('assets/models/monument.glb');

      await assets.model('assets/models/monument.glb');

      // First release should have dropped the cache, so the model is fetched again.
      expect(gltf.loads.length).toBe(2);
    });
  });

  describe('preloading', () => {
    it('loads every asset of the requested group and reports progress', async () => {
      const progress: [number, number][] = [];

      await assets.preload(MANIFEST, 'core', (loaded, total) => progress.push([loaded, total]));

      expect(gltf.loads).toEqual(['assets/models/monument.glb']);
      expect(textures.loads).toEqual(['assets/screens/novaverta.webp']);
      expect(progress.at(-1)).toEqual([2, 2]);
    });

    it('keeps preloaded assets cached so the world gets them without a second fetch', async () => {
      await assets.preload(MANIFEST, 'core');

      await assets.model('assets/models/monument.glb');
      assets.load('assets/screens/novaverta.webp');

      expect(gltf.loads.length).toBe(1);
      expect(textures.loads.length).toBe(1);
    });

    it('finishes the preload even when one asset fails, reporting the failure', async () => {
      gltf.failing.add('assets/models/monument.glb');

      const failed = await assets.preload(MANIFEST, 'core');

      expect(failed).toEqual(['assets/models/monument.glb']);
      expect(textures.loads).toEqual(['assets/screens/novaverta.webp']);
    });

    it('does not keep a texture that failed to load, so a later load tries again', async () => {
      textures.failing.add('assets/screens/novaverta.webp');
      await assets.preload(MANIFEST, 'core');
      textures.failing.delete('assets/screens/novaverta.webp');

      assets.load('assets/screens/novaverta.webp');

      expect(textures.loads.filter((u) => u.endsWith('novaverta.webp')).length).toBe(2);
    });

    it('survives two consumers waiting on the same failing model', async () => {
      gltf.failing.add('assets/models/broken.glb');
      const first = assets.model('assets/models/broken.glb');
      const second = assets.model('assets/models/broken.glb');

      await expect(first).rejects.toThrow();
      await expect(second).rejects.toThrow();
      gltf.failing.delete('assets/models/broken.glb');
      await expect(assets.model('assets/models/broken.glb')).resolves.toBeInstanceOf(Group);
    });

    it('lists the urls of a group, so a landmark can fetch its own group lazily', () => {
      expect(assets.urlsOf(MANIFEST, 'deslopify')).toEqual(['assets/models/arch.glb']);
    });
  });
});

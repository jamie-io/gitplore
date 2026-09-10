import { InjectionToken, Service, inject } from '@angular/core';
import { Group, LoadingManager, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject3D, forEachResource, markManaged } from './dispose';

/** `public/assets/manifest.json`, written by `npm run assets:optimize` (IMPLEMENTATION_PLAN.md §8). */
export interface AssetManifest {
  readonly assets: readonly AssetEntry[];
}

export interface AssetEntry {
  readonly url: string;
  readonly bytes: number;
  /** `core` is preloaded behind the loading screen; a project slug loads when the player is near. */
  readonly group: 'core' | string;
}

/** The slice of `TextureLoader` the service uses, so tests can stand in for it. */
export interface TextureLoaderLike {
  load(
    url: string,
    onLoad?: (texture: Texture) => void,
    onProgress?: undefined,
    onError?: (error: unknown) => void,
  ): Texture;
}

export interface GltfLoaderLike {
  loadAsync(url: string): Promise<{ scene: Group }>;
}

export const LOADING_MANAGER = new InjectionToken<LoadingManager>('LOADING_MANAGER', {
  providedIn: 'root',
  factory: () => new LoadingManager(),
});

export const TEXTURE_LOADER = new InjectionToken<TextureLoaderLike>('TEXTURE_LOADER', {
  providedIn: 'root',
  factory: () => new TextureLoader(inject(LOADING_MANAGER)),
});

export const GLTF_LOADER = new InjectionToken<GltfLoaderLike>('GLTF_LOADER', {
  providedIn: 'root',
  factory: () => {
    const loader = new GLTFLoader(inject(LOADING_MANAGER));
    // Meshopt over Draco: tiny decoder, no wasm fetch stall (§8).
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  },
});

const MODEL_EXTENSIONS = /\.(glb|gltf)$/i;

/** What the world sees of the asset service: shared textures and per-consumer model copies. */
export interface AssetLike {
  load(url: string): Texture;
  release(url: string): void;
  model(url: string): Promise<Group>;
  releaseModel(url: string): void;
}

/**
 * Caches textures and models by URL with refcounts and disposes at zero (IMPLEMENTATION_PLAN.md
 * §2, §8). Textures are shared as-is (and marked managed, so `disposeObject3D` leaves them to
 * this service); models are parsed once and cloned per consumer.
 */
@Service()
export class AssetService implements AssetLike {
  private readonly textureLoader = inject(TEXTURE_LOADER);
  private readonly gltfLoader = inject(GLTF_LOADER);

  private readonly textures = new Map<string, { texture: Texture; refs: number }>();
  private readonly models = new Map<string, { source: Promise<Group>; refs: number }>();

  /** A shared texture; every `load` needs a matching `release`. */
  load(url: string): Texture {
    const { texture, settled } = this.acquire(url);
    // Nothing awaits a synchronous `load`; the eviction inside `acquire` is what matters here.
    settled.catch(() => undefined);
    return texture;
  }

  release(url: string): void {
    const cached = this.textures.get(url);
    if (!cached) {
      return;
    }

    cached.refs--;
    if (cached.refs <= 0) {
      cached.texture.dispose();
      this.textures.delete(url);
    }
  }

  /** A fresh copy of a model's scene; the parsed source is shared and refcounted. */
  async model(url: string): Promise<Group> {
    let cached = this.models.get(url);
    if (!cached) {
      cached = {
        source: this.gltfLoader.loadAsync(url).then((gltf) => markModelManaged(gltf.scene)),
        refs: 0,
      };
      this.models.set(url, cached);
    }

    cached.refs++;
    try {
      // `clone()` shares geometry, materials and textures with the source, which is the point:
      // they are marked managed, so a consumer's `disposeObject3D` leaves them to this service.
      // (Static props only — skinned or animated models would need SkeletonUtils.clone.)
      return (await cached.source).clone();
    } catch (error) {
      cached.refs--;
      // Only the entry that failed is dropped; a concurrent waiter may already have replaced it.
      if (this.models.get(url) === cached) {
        this.models.delete(url);
      }
      throw error;
    }
  }

  releaseModel(url: string): void {
    const cached = this.models.get(url);
    if (!cached) {
      return;
    }

    cached.refs--;
    if (cached.refs <= 0) {
      this.models.delete(url);
      void cached.source.then((source) => disposeObject3D(source)).catch(() => undefined);
    }
  }

  urlsOf(manifest: AssetManifest, group: string): string[] {
    return manifest.assets.filter((asset) => asset.group === group).map((asset) => asset.url);
  }

  /**
   * Fetches a whole group up front and keeps one reference on each asset, so the world finds
   * everything cached. Progress counts assets, which is what the loading screen shows. A failed
   * asset is reported, not thrown: every model has a proxy, so the world can do without it.
   */
  async preload(
    manifest: AssetManifest,
    group: string,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<string[]> {
    const urls = this.urlsOf(manifest, group);
    const failed: string[] = [];
    let loaded = 0;
    onProgress?.(0, urls.length);

    await Promise.all(
      urls.map(async (url) => {
        try {
          if (MODEL_EXTENSIONS.test(url)) {
            // `model` hands out a clone we do not need; the reference itself is what we keep.
            await this.model(url);
          } else {
            await this.loadAsync(url);
          }
        } catch {
          failed.push(url);
        }
        onProgress?.(++loaded, urls.length);
      }),
    );

    return failed;
  }

  /** `load`, but settled only once the image has arrived (or failed), for honest progress. */
  private loadAsync(url: string): Promise<Texture> {
    return this.acquire(url).settled;
  }

  /**
   * One take on a cached texture: the handle callers get straight away, plus the promise that
   * says whether it ever arrived. Both entry points go through here, so a failed load is evicted
   * from the cache however it was started — a blank texture must not be handed out as if it had
   * arrived, least of all forever.
   */
  private acquire(url: string): { texture: Texture; settled: Promise<Texture> } {
    const cached = this.textures.get(url);
    if (cached) {
      cached.refs++;
      return { texture: cached.texture, settled: Promise.resolve(cached.texture) };
    }

    // The loader may call back synchronously (the test stub does), so the callbacks use their own
    // arguments and the cache entry is only written for a load that has not already failed.
    let failed = false;
    let texture!: Texture;
    const settled = new Promise<Texture>((resolve, reject) => {
      texture = this.textureLoader.load(
        url,
        (loaded) => resolve(loaded),
        undefined,
        (error) => {
          failed = true;
          this.textures.delete(url);
          reject(error);
        },
      );
    });

    if (!failed) {
      markManaged(texture);
      this.textures.set(url, { texture, refs: 1 });
    }
    return { texture, settled };
  }
}

/** Flags everything a model shares between its clones, so no consumer frees it. */
function markModelManaged(scene: Group): Group {
  forEachResource(scene, {
    geometry: markManaged,
    material: (material) => void markManaged(material),
    texture: markManaged,
  });
  return scene;
}

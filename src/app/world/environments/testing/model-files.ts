import { Group, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AssetLike } from '@engine/asset.service';

/** Reads a file's bytes; a spec passes `readFileSync`, which the app's own types do not know. */
export type ReadFile = (path: string) => Uint8Array;

/** Parses a published model from disk, meshopt and quantisation included, as the game loads it. */
export async function loadModelFile(read: ReadFile, path: string): Promise<Group> {
  await MeshoptDecoder.ready;
  const bytes = read(path);
  const buffer = new Uint8Array(bytes.byteLength);
  buffer.set(bytes);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.parse(buffer.buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

/**
 * An asset service that serves the published models in `public/`, one copy per request as the real
 * service does, and records every request and release. `failing` models reject as a 404 would, and
 * the real service then keeps no reference, so they are never released.
 */
export class ModelFiles implements AssetLike {
  readonly requested: string[] = [];
  readonly releasedModels: string[] = [];
  private readonly sources = new Map<string, Promise<Group>>();
  private readonly pending: Promise<unknown>[] = [];

  constructor(
    private readonly read: ReadFile,
    private readonly failing: (url: string) => boolean = () => false,
  ) {}

  model(url: string): Promise<Group> {
    this.requested.push(url);
    const copy = this.failing(url)
      ? Promise.reject(new Error(`404 ${url}`))
      : this.source(url).then((scene) => scene.clone());
    this.pending.push(copy.catch(() => undefined));
    return copy;
  }

  releaseModel(url: string): void {
    this.releasedModels.push(url);
  }

  load(): Texture {
    return new Texture();
  }

  release(): void {
    // Textures are not what these specs look at.
  }

  /** Waits until every model asked for so far has arrived or failed, and its handlers have run. */
  async settled(): Promise<void> {
    let seen = -1;
    while (seen !== this.pending.length) {
      seen = this.pending.length;
      await Promise.all(this.pending);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  private source(url: string): Promise<Group> {
    let source = this.sources.get(url);
    if (!source) {
      source = loadModelFile(this.read, `public/${url}`);
      this.sources.set(url, source);
    }
    return source;
  }
}

import { Group, PerspectiveCamera, Scene, Texture } from 'three';
import { AssetLike } from '../asset.service';
import { DeviceCapabilities, qualitySettings } from '../capability.service';
import { PlayerController } from '../player/player-controller';
import { WorldContext } from '../world-object';

/** An asset service that records requests and lets a test resolve models by hand. */
export class StubAssets implements AssetLike {
  requested: string[] = [];
  releasedModels: string[] = [];
  loaded: string[] = [];
  released: string[] = [];
  handedOut: Texture[] = [];
  private pending: { resolve: (group: Group) => void; reject: (error: Error) => void }[] = [];

  model(url: string): Promise<Group> {
    this.requested.push(url);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  releaseModel(url: string): void {
    this.releasedModels.push(url);
  }

  load(url: string): Texture {
    this.loaded.push(url);
    const texture = new Texture();
    this.handedOut.push(texture);
    return texture;
  }

  release(url: string): void {
    this.released.push(url);
  }

  /** Delivers `group` to the oldest pending model request and lets the microtasks run. */
  async resolve(group = new Group()): Promise<void> {
    this.pending.shift()?.resolve(group);
    await Promise.resolve();
    await Promise.resolve();
  }

  /** Fails the oldest pending model request, as a 404 would. */
  async reject(): Promise<void> {
    this.pending.shift()?.reject(new Error('404'));
    await Promise.resolve();
    await Promise.resolve();
  }
}

/** A world context for unit tests, with a fresh scene and a stub asset service. */
export function stubContext(assets: AssetLike = new StubAssets()): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
    assets,
  };
}

/** A desktop that comfortably clears every capability gate; the baseline most specs want. */
export const CAPABLE: DeviceCapabilities = {
  webgl2: true,
  rendererDescription: 'Apple M2',
  hardwareConcurrency: 10,
  devicePixelRatio: 2,
  reducedMotion: false,
  coarsePointer: false,
};

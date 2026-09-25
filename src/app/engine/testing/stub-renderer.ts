import { QualitySettings } from '../capability.service';
import { RendererLike } from '../renderer.factory';

/** A renderer that draws nothing and remembers what it was asked, for specs that run the engine. */
export class StubRenderer implements RendererLike {
  loop: ((time: number) => void) | null = null;
  renders = 0;
  disposed = false;
  width = 0;
  height = 0;
  pixelRatio = 1;
  readonly domElement = document.createElement('canvas');
  readonly qualities: QualitySettings[] = [];
  readonly info = { memory: { geometries: 0, textures: 0 } };
  renderListsDisposed = 0;
  readonly renderLists = { dispose: () => void this.renderListsDisposed++ };

  setAnimationLoop(fn: ((time: number) => void) | null) {
    this.loop = fn;
  }
  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  setPixelRatio(ratio: number) {
    this.pixelRatio = ratio;
  }
  setQuality(quality: QualitySettings) {
    this.qualities.push(quality);
  }
  render() {
    this.renders++;
  }
  dispose() {
    this.disposed = true;
  }
}

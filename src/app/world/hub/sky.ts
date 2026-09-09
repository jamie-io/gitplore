import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { WorldContext, WorldObject } from '@engine/world-object';
import { disposeObject3D } from '@engine/dispose';

const HORIZON = new Color(0xbcd7e8);
const ZENITH = new Color(0x3f7bb8);
const SUN = new Color(0xfff2d6);

/** Radians per second the dome drifts; slow enough to read as weather, not as spinning. */
const DRIFT_SPEED = 0.004;

/** Vertical gradient dome plus the two lights the low-poly world needs. */
export class Sky implements WorldObject {
  readonly id = 'sky';

  rotation = 0;

  private readonly added: Object3D[] = [];
  private dome?: Mesh;
  private scene?: WorldContext['scene'];

  constructor(private readonly options: { readonly reducedMotion: boolean }) {}

  init(ctx: WorldContext): void {
    this.scene = ctx.scene;
    ctx.scene.fog = new Fog(HORIZON.getHex(), ctx.quality.fogFar * 0.35, ctx.quality.fogFar);
    ctx.scene.background = HORIZON.clone();

    this.dome = new Mesh(new SphereGeometry(ctx.quality.fogFar * 1.2, 24, 16), gradientMaterial());
    this.dome.name = 'sky-dome';

    const hemisphere = new HemisphereLight(ZENITH.getHex(), 0x5a6b47, 1.1);
    const sun = new DirectionalLight(SUN.getHex(), 1.9);
    sun.position.set(60, 90, 30);
    sun.castShadow = ctx.quality.shadows;

    this.added.push(this.dome, hemisphere, sun);
    this.added.forEach((object) => ctx.scene.add(object));
  }

  update(dt: number): void {
    if (this.options.reducedMotion || !this.dome) {
      return;
    }

    this.rotation += dt * DRIFT_SPEED;
    this.dome.rotation.y = this.rotation;
  }

  dispose(): void {
    this.added.forEach(disposeObject3D);
    this.added.length = 0;
    this.dome = undefined;

    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
      this.scene = undefined;
    }
  }
}

function gradientMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      horizon: { value: HORIZON },
      zenith: { value: ZENITH },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 zenith;
      varying vec3 vWorld;
      void main() {
        float t = clamp(vWorld.y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.45, 0.95, t)), 1.0);
      }
    `,
  });
}

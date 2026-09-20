import { CylinderGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { assemble, paint } from '../flora';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { HeightField } from '@engine/player/collision';
import { createLabel } from '../../landmarks/base/label';

/** Stable colours keep the same language recognisable across repository worlds. */
export const LANGUAGE_COLOURS: Readonly<Record<string, number>> = {
  TypeScript: 0x3178c6,
  JavaScript: 0xf1e05a,
  HTML: 0xe34c26,
  CSS: 0x563d7c,
  SCSS: 0xc6538c,
  Shell: 0x89e051,
  Python: 0x3572a5,
  Java: 0xb07219,
  PHP: 0x4f5d95,
  C: 0x555555,
  'C++': 0xf34b7d,
  'C#': 0x178600,
};

const FALLBACK_COLOUR = 0x8a8f98;
const PILLAR_WIDTH = 0.55;
const PILLAR_BASE = 0.35;
const PILLAR_MAX = 3.6;
const PILLAR_SPACING = 1.2;

export interface LanguagePillarsOptions {
  readonly project: Project;
  readonly origin: Vector3;
  readonly rotationY: number;
  readonly ground: HeightField;
}

/** One pillar per language, merged into one coloured mesh. Missing languages get one quiet label. */
export class LanguagePillars implements WorldObject {
  readonly id = 'language-pillars';

  private mesh?: Mesh;
  private label?: Mesh;

  constructor(private readonly options: LanguagePillarsOptions) {}

  init(ctx: WorldContext): void {
    const languages = languageEntries(this.options.project);
    if (languages.length === 0) {
      this.addEmptyLabel(ctx, 'Keine Sprachdaten');
      return;
    }

    const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0);
    const parts = languages.map(([language, bytes], index) => {
      const share = total > 0 ? bytes / total : 0;
      const height = PILLAR_BASE + share * PILLAR_MAX;
      const offset = (index - (languages.length - 1) / 2) * PILLAR_SPACING;
      const x = this.options.origin.x + Math.cos(this.options.rotationY) * offset;
      const z = this.options.origin.z - Math.sin(this.options.rotationY) * offset;
      return paint(
        new CylinderGeometry(PILLAR_WIDTH / 2, PILLAR_WIDTH / 1.8, height, 6).translate(
          x,
          this.options.ground.heightAt(x, z) + height / 2,
          z,
        ),
        LANGUAGE_COLOURS[language] ?? FALLBACK_COLOUR,
      );
    });
    const geometry = assemble(parts);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08 }),
    );
    mesh.name = this.id;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(): void {
    // Language data does not animate.
  }

  dispose(): void {
    if (this.label) {
      disposeObject3D(this.label);
      this.label = undefined;
    }
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }

  private addEmptyLabel(ctx: WorldContext, text: string): void {
    const label = createLabel(text, this.options.project.theme.primary);
    if (!label) {
      return;
    }
    label.name = 'language-pillars-label';
    label.position.copy(this.options.origin).setY(this.options.origin.y + 1.3);
    label.rotation.y = this.options.rotationY;
    this.label = label;
    ctx.scene.add(label);
  }
}

function languageEntries(project: Project): readonly [string, number][] {
  return Object.entries(project.languages ?? {})
    .filter(([, bytes]) => typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

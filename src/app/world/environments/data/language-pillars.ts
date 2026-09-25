import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { STONE } from '../architecture';
import { assemble, paint } from '../flora';
import { bakeGeometry, borrowModels, mergeBaked, tintGeometry } from '../model-geometry';
import type { HazedCopies } from '../shaders/hazed-copies';
import type { Project } from '@content/project.model';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import type { HeightField } from '@engine/player/collision';
import { createPlankSign } from './plank-sign';

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
/**
 * The Plaza's Tuscan column (scripts/blender/models/plaza_pillar.py): a `base`, a unit-high `shaft`
 * and a `capital` ending at 1 m, all white, stretched to each pillar's height.
 */
export const PLAZA_PILLAR_MODEL = 'assets/models/plaza-pillar.glb';
const PILLAR_WIDTH = 0.55;
const PILLAR_BASE = 0.35;
const PILLAR_MAX = 3.6;
const PILLAR_SPACING = 1.2;
const PILLAR_SIDE_GAP = 0.5;
export const JUNGLE_BAMBOO_COLOUR = 0x4f7a3a;
export const JUNGLE_BAMBOO_NODE_COLOUR = 0x3d6230;
export const JUNGLE_BAMBOO_BAND_OFFSET = 0.18;

/** Keep repository-controlled rows within one side of the visitor's walk. */
export const MAX_LANGUAGE_PILLARS = 12;

type ToySkin = 'default' | 'jungle' | 'plaza';

export interface LanguagePillarsOptions {
  readonly project: Project;
  readonly origin: Vector3;
  readonly rotationY: number;
  /**
   * Where each stalk stands, largest share first, instead of a row across `origin`: as many
   * languages as there are spots, and no sign (the place itself names them).
   */
  readonly stalks?: readonly Vector3[];
  readonly ground: HeightField;
  readonly skin?: ToySkin;
  /** Hazes the Plaza's columns into the square's air; the other skins keep their plain material. */
  readonly haze?: HazedCopies;
}

/** A pillar of the plain row: where it stands, how high, in which colour. */
interface Pillar {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly colour: number;
}

/** One capped pillar per language, merged into one coloured mesh. Missing data stays silent. */
export class LanguagePillars implements WorldObject {
  readonly id = 'language-pillars';

  private mesh?: Mesh;
  private sign?: Group;
  private disposed = false;

  constructor(private readonly options: LanguagePillarsOptions) {}

  init(ctx: WorldContext): void {
    this.disposed = false;
    const stalks = this.options.stalks;
    const languages = stalks
      ? languageEntries(this.options.project).slice(0, stalks.length)
      : languageEntries(this.options.project);
    if (languages.length === 0) {
      return;
    }

    const jungle = this.options.skin === 'jungle';
    const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0);
    const stalkHeights = languages.map(([, bytes]) =>
      jungle ? 1.4 + (total > 0 ? bytes / total : 0) * 3.6 : 0,
    );
    let nodeCount = 0;
    const pillars: Pillar[] = [];
    const parts = languages.flatMap(([language, bytes], index) => {
      const share = total > 0 ? bytes / total : 0;
      const offset = (index - (languages.length - 1) / 2) * PILLAR_SPACING;
      const x =
        stalks?.[index].x ?? this.options.origin.x + Math.cos(this.options.rotationY) * offset;
      const z =
        stalks?.[index].z ?? this.options.origin.z - Math.sin(this.options.rotationY) * offset;
      if (!jungle) {
        const pillar: Pillar = {
          x,
          y: this.options.ground.heightAt(x, z),
          z,
          height: PILLAR_BASE + share * PILLAR_MAX,
          colour: LANGUAGE_COLOURS[language] ?? FALLBACK_COLOUR,
        };
        pillars.push(pillar);
        return [
          paint(
            new CylinderGeometry(PILLAR_WIDTH / 2, PILLAR_WIDTH / 1.8, pillar.height, 6).translate(
              x,
              pillar.y + pillar.height / 2,
              z,
            ),
            pillar.colour,
          ),
        ];
      }

      const height = 1.4 + share * 3.6;
      const ground = this.options.ground.heightAt(x, z);
      const lean = (((index * 53 + 17) % 9) - 4) * (Math.PI / 180);
      const bamboo: ReturnType<typeof paint>[] = [
        paint(
          new CylinderGeometry(0.09, 0.13, height, 8)
            .translate(0, height / 2, 0)
            .rotateZ(lean)
            .translate(x, ground, z),
          JUNGLE_BAMBOO_COLOUR,
        ),
      ];
      for (let nodeY = 0.45; nodeY < height; nodeY += 0.45) {
        nodeCount++;
        const stemRadius = 0.09 + (0.13 - 0.09) * (1 - nodeY / height);
        const nodeRadius = stemRadius + 0.015;
        bamboo.push(
          paint(
            new CylinderGeometry(nodeRadius, nodeRadius, 0.03, 8)
              .translate(0, nodeY, 0)
              .rotateZ(lean)
              .translate(x, ground, z),
            JUNGLE_BAMBOO_NODE_COLOUR,
          ),
        );
      }
      bamboo.push(
        paint(
          new CylinderGeometry(0.14, 0.14, 0.08, 8)
            .translate(0, height - JUNGLE_BAMBOO_BAND_OFFSET, 0)
            .rotateZ(lean)
            .translate(x, ground, z),
          LANGUAGE_COLOURS[language] ?? FALLBACK_COLOUR,
        ),
      );
      return bamboo;
    });
    const geometry = assemble(parts);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.08,
    });
    const plaza = this.options.skin === 'plaza';
    // In the Plaza's air, as the square is: hazed on every tier but the lowest. The jungle's
    // bamboo stands in the Lichtung's atmosphere like the release cairns beside it.
    const hazed = jungle || (plaza && ctx.quality.shaderDetail > 0);
    const mesh = new Mesh(
      geometry,
      hazed && this.options.haze ? this.options.haze.own(material) : material,
    );
    mesh.name = this.id;
    mesh.userData['stalkCount'] = languages.length;
    mesh.userData['nodeCount'] = jungle ? nodeCount : 0;
    mesh.userData['stalkHeights'] = stalkHeights;
    mesh.castShadow = ctx.quality.shadows;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);
    if (plaza) {
      this.loadColumns(ctx, mesh, pillars);
    }

    if (jungle && !stalks) {
      const sign = createPlankSign('Sprachen · Languages', this.options.project.theme.primary);
      if (sign) {
        sign.name = 'language-pillars-sign';
        sign.position.set(
          this.options.origin.x,
          this.options.ground.heightAt(this.options.origin.x, this.options.origin.z),
          this.options.origin.z,
        );
        sign.rotation.y = this.options.rotationY;
        this.sign = sign;
        ctx.scene.add(sign);
      }
    }
  }

  update(): void {
    // Language data does not animate.
  }

  /** Swaps the plain pillars for the Plaza's columns once the model arrives; without it they stay. */
  private loadColumns(ctx: WorldContext, mesh: Mesh, pillars: readonly Pillar[]): void {
    borrowModels(
      ctx.assets,
      [PLAZA_PILLAR_MODEL],
      () => this.disposed,
      (models) => {
        const model = models.get(PLAZA_PILLAR_MODEL)!;
        const [base, shaft, capital] = ['base', 'shaft', 'capital'].map((name) => {
          const node = model.getObjectByName(name);
          return node ? bakeGeometry(node) : null;
        });
        if (base && shaft && capital) {
          mesh.geometry.dispose();
          mesh.geometry = buildColumns(pillars, this.options.rotationY, base, shaft, capital);
        }
        [base, shaft, capital].forEach((part) => part?.dispose());
      },
    );
  }

  dispose(): void {
    this.disposed = true;
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
    if (this.sign) {
      disposeObject3D(this.sign);
      this.sign = undefined;
    }
  }
}

/**
 * The row from the Plaza's column: per pillar the `base` on the ground, the unit-high `shaft`
 * stretched to the pillar's height in its language's colour, and the `capital` ending at that
 * height, both in stone, all turned square to the row. Every column stays exactly as high as the
 * plain pillar. Base and capital take at most half a short column between them, flattened about
 * their own foot and top but never narrowed, so they still frame the shaft: at full height they left
 * the shortest columns a squat 10 cm of shaft.
 */
function buildColumns(
  pillars: readonly Pillar[],
  rotationY: number,
  base: BufferGeometry,
  shaft: BufferGeometry,
  capital: BufferGeometry,
): BufferGeometry {
  base.computeBoundingBox();
  capital.computeBoundingBox();
  const baseHeight = base.boundingBox!.max.y;
  const capitalTop = capital.boundingBox!.max.y;
  const ends = baseHeight + capitalTop - capital.boundingBox!.min.y;
  return mergeBaked(
    pillars.flatMap(({ x, y, z, height, colour }) => {
      const fit = Math.min(1, height / 2 / ends);
      return [
        tintGeometry(base.clone(), STONE).scale(1, fit, 1),
        tintGeometry(shaft.clone(), colour).scale(1, height, 1),
        tintGeometry(capital.clone(), STONE)
          .translate(0, -capitalTop, 0)
          .scale(1, fit, 1)
          .translate(0, height, 0),
      ].map((part) => part.rotateY(rotationY).translate(x, y, z));
    }),
  );
}

function languageEntries(project: Project): readonly [string, number][] {
  return Object.entries(project.languages ?? {})
    .filter(([, bytes]) => typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0)
    .sort(([leftLanguage, leftBytes], [rightLanguage, rightBytes]) => {
      const byteOrder = rightBytes - leftBytes;
      return byteOrder !== 0 ? byteOrder : leftLanguage.localeCompare(rightLanguage, 'en');
    })
    .slice(0, MAX_LANGUAGE_PILLARS);
}

/** Half of visible row, excluding the pillar radius. */
export function languageRowHalfSpan(project: Project): number {
  return Math.max(0, (languageEntries(project).length - 1) / 2) * PILLAR_SPACING;
}

/** Centre offset that keeps the capped row clear of the walk by its own half-width. */
export function languageSideOffset(project: Project): number {
  return languageRowHalfSpan(project) + PILLAR_WIDTH / 2 + PILLAR_SIDE_GAP;
}

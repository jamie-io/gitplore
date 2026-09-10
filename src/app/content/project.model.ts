import type { Type } from '@angular/core';

/** Where the README text comes from (IMPLEMENTATION_PLAN.md §4). */
export type ReadmeSource =
  | { readonly kind: 'bundled'; readonly path: string }
  | {
      readonly kind: 'github';
      readonly owner: string;
      readonly repo: string;
      readonly ref?: string;
    };

/**
 * How a project can be tried.
 *
 * `embeddable` is verified against the live headers by `npm run content:check`, so it can never
 * quietly become a lie.
 */
export type ProjectDemo =
  | {
      readonly kind: 'iframe';
      readonly url: string;
      readonly embeddable: boolean;
      readonly screenshot: string;
    }
  | {
      readonly kind: 'custom';
      readonly mode: 'in-world' | 'panel';
      readonly panelComponent?: () => Promise<Type<unknown>>;
    }
  | { readonly kind: 'none' };

export type LandmarkKind = 'portal' | 'screen' | (string & {});

export interface ProjectLandmark {
  readonly kind: LandmarkKind;
  /** Absent means the scene places it at one of the environment's anchors. */
  readonly position?: readonly [number, number, number];
  /** Absent means the scene turns it to face the spawn. */
  readonly rotationY?: number;
  readonly model?: string;
}

export interface Project {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly repoUrl: string;
  readonly year?: number;
  /** Absent when the repository ships no README; the panel then omits the section. */
  readonly readme?: ReadmeSource;
  readonly demo: ProjectDemo;
  readonly landmark: ProjectLandmark;
  readonly theme: { readonly primary: string; readonly accent: string };
}

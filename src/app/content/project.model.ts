import type { Type } from '@angular/core';
import type { SyncedRelease } from './synced-repo';

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

/**
 * Which reusable world stands behind a project's portal
 * (repo-design-notes/specs/2026-09-10-repo-worlds-design.md §5). `clearing` is the start world and
 * is not a destination; a repository that names it simply gets a second clearing. Nothing selects
 * `clearing` today, and it is not actually harmless: `ProjectScene` puts the return portal at
 * `environment.spawn`, which for the clearing is the origin, where the `Monument` stands with its
 * collider — pick this deliberately, not as a "default-ish" placeholder.
 */
export type EnvironmentId = 'clearing' | 'jungle' | 'showroom' | 'plaza';

/** Every id `world/environments/create-environment.ts` can resolve; the schema test's yardstick. */
export const ENVIRONMENT_IDS: readonly EnvironmentId[] = [
  'clearing',
  'jungle',
  'showroom',
  'plaza',
];

export interface Project {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly repoUrl: string;
  /** Optional repository data; thin or older committed records simply omit each field. */
  readonly pushedAt?: string;
  readonly stars?: number;
  readonly languages?: Readonly<Record<string, number>>;
  readonly commitBuckets?: readonly number[];
  readonly createdAt?: string;
  readonly license?: string | null;
  readonly releases?: readonly SyncedRelease[];
  readonly forks?: number;
  readonly openIssues?: number;
  readonly size?: number;
  readonly year?: number;
  /** Absent when the repository ships no README; the panel then omits the section. */
  readonly readme?: ReadmeSource;
  readonly demo: ProjectDemo;
  readonly landmark: ProjectLandmark;
  /** The world the portal leads to; `mergeRepo` always resolves one. */
  readonly environment: EnvironmentId;
  readonly theme: { readonly primary: string; readonly accent: string };
}

import type { EnvironmentId } from '@content/project.model';
import type { Environment } from './environment';

export interface EnvironmentOptions {
  /** Read live, so a settings change applies without rebuilding the world. */
  readonly reducedMotion: () => boolean;
}

type EnvironmentFactory = (options: EnvironmentOptions) => Environment;

/**
 * One dynamic import per environment, so neither the initial bundle nor the start world's chunk
 * grows when a new world is added (spec §5). The literal `import()` calls are what let the builder
 * split them out; a computed specifier would defeat that.
 */
const LOADERS: Readonly<Record<EnvironmentId, () => Promise<EnvironmentFactory>>> = {
  clearing: () => import('./clearing').then((m) => (o) => new m.ClearingEnvironment(o)),
  showroom: () => import('./showroom').then((m) => (o) => new m.ShowroomEnvironment(o)),
  jungle: () => import('./jungle').then((m) => (o) => new m.JungleEnvironment(o)),
  plaza: () => import('./plaza').then((m) => (o) => new m.PlazaEnvironment(o)),
};

/**
 * Builds the environment an id names. An id the registry does not know falls back to the showroom
 * rather than throwing: ids arrive from `repos.json` via the merge, and `merged-projects.spec.ts`
 * guards them at build time, but a visitor with a stale cached file must still get a world.
 */
export async function createEnvironment(
  id: EnvironmentId,
  options: EnvironmentOptions,
): Promise<Environment> {
  const load = LOADERS[id] ?? LOADERS.showroom;

  return (await load())(options);
}

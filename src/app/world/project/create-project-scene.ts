import { ProjectScene, ProjectSceneOptions } from './project.scene';

/**
 * Slugs with a scene of their own, each behind its own dynamic import so a bespoke world never
 * weighs on the generic one. The same registry shape as `createLandmark`, and the same rule:
 * anything unknown gets the generic scene, so a typo never leaves a project unreachable.
 */
const BESPOKE: Readonly<
  Record<string, () => Promise<new (o: ProjectSceneOptions) => ProjectScene>>
> = {
  deslopify: () => import('../projects/deslopify/deslopify.scene').then((m) => m.DeslopifyScene),
  webkatalog_demoshop: () =>
    import('../projects/webkatalog/webkatalog.scene').then((m) => m.WebkatalogScene),
  novaverta: () => import('../projects/novaverta/novaverta.scene').then((m) => m.NovavertaScene),
};

export async function createProjectScene(options: ProjectSceneOptions): Promise<ProjectScene> {
  const load = BESPOKE[options.project.slug];
  if (!load) {
    return new ProjectScene(options);
  }

  const Scene = await load();

  return new Scene(options);
}

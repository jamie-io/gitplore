import { Routes } from '@angular/router';
import { simpleViewGuard } from './shared/simple-view.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/world/world.page').then((m) => m.WorldPage),
    canActivate: [simpleViewGuard],
    children: [
      {
        // Componentless on purpose (spec §6's `ProjectDestination`): this node exists to carry
        // `:slug` for the `SceneDirector` and to hand it down to the panel. Angular's default
        // `paramsInheritanceStrategy` inherits params from a component-less parent, so
        // `withComponentInputBinding()` still fills `ProjectPanel.slug`.
        path: 'p/:slug',
        children: [
          {
            path: 'info',
            loadComponent: () =>
              import('./ui/project-panel/project-panel').then((m) => m.ProjectPanel),
          },
        ],
      },
    ],
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects-list.page').then((m) => m.ProjectsListPage),
  },
  {
    path: 'projects/:slug',
    loadComponent: () =>
      import('./features/projects/project-detail.page').then((m) => m.ProjectDetailPage),
  },
  { path: '**', redirectTo: '' },
];

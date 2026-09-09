import { Routes } from '@angular/router';
import { simpleViewGuard } from './shared/simple-view.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/hub/hub.page').then((m) => m.HubPage),
    canActivate: [simpleViewGuard],
    children: [
      {
        path: 'p/:slug',
        loadComponent: () => import('./ui/project-panel/project-panel').then((m) => m.ProjectPanel),
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

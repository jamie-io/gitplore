import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Screen-reader and mobile path (IMPLEMENTATION_PLAN.md §7). Filled with real content in M2. */
@Component({
  selector: 'app-projects-list-page',
  imports: [RouterLink],
  template: `
    <main>
      <h1>Projects</h1>
      <p>The project list arrives with M2.</p>
      <a routerLink="/" [queryParams]="{ force3d: 1 }">Try the 3D world anyway</a>
    </main>
  `,
})
export class ProjectsListPage {}

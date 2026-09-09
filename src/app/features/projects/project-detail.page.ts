import { Component, input } from '@angular/core';

/** Simple-view counterpart of the project panel. Filled with real content in M2. */
@Component({
  selector: 'app-project-detail-page',
  template: `
    <main>
      <h1>{{ slug() }}</h1>
      <p>The project detail view arrives with M2.</p>
    </main>
  `,
})
export class ProjectDetailPage {
  readonly slug = input('');
}

import { Component, input } from '@angular/core';

/** Overlay destination opened by `/p/:slug` over the paused hub. Filled with content in M2. */
@Component({
  selector: 'app-project-panel',
  template: `
    <div class="panel" role="dialog" aria-modal="true" [attr.aria-label]="slug()">
      <h2>{{ slug() }}</h2>
      <p>The project panel arrives with M2.</p>
    </div>
  `,
  styles: `
    .panel {
      position: fixed;
      inset: 10%;
      overflow: auto;
      padding: 1.5rem;
      border-radius: 0.75rem;
      background: rgb(255 255 255 / 92%);
      color: #111;
    }
  `,
})
export class ProjectPanel {
  readonly slug = input('');
}

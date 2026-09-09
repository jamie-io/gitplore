import { Injector, Service, inject } from '@angular/core';
import type { Signal } from '@angular/core';
import { HttpResourceRef, httpResource } from '@angular/common/http';

/**
 * Reads the README copy that `npm run content:sync` bundled into `public/content/readme/`.
 *
 * The URL is relative on purpose: it resolves against `<base href>`, so moving from GitHub Pages
 * (`/gitplore/`) to our own server (`/`) stays a build flag (IMPLEMENTATION_PLAN.md §4, §9).
 */
@Service()
export class ReadmeService {
  private readonly injector = inject(Injector);

  readme(slug: Signal<string | undefined>): HttpResourceRef<string | undefined> {
    return httpResource.text(
      () => {
        const value = slug();
        return value ? `content/readme/${value}.md` : undefined;
      },
      { injector: this.injector },
    );
  }
}

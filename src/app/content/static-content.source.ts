import type { ContentSource } from './content-source';
import type { Project } from './project.model';
import { PROJECTS } from './projects';

/** The curated portfolio, compiled into the bundle. */
export class StaticContentSource implements ContentSource {
  projects(): Promise<readonly Project[]> {
    return Promise.resolve(PROJECTS);
  }
}

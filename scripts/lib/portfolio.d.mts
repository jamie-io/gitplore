import type { Project } from '../../src/app/content/project.model';
import type { SyncedRepo } from '../../src/app/content/synced-repo';

export declare function syncedRepos(): SyncedRepo[];
export declare function mergedProjects(): readonly Project[];

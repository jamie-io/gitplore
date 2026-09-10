/** Where the production build lands, for every script that reads it. */
import { fileURLToPath } from 'node:url';

/** `DIST_ROOT` lets a second instance serve a copy (e.g. for Lighthouse) while e2e rebuilds dist. */
export const distRoot = () =>
  process.env.DIST_ROOT
    ? process.env.DIST_ROOT.replace(/\/?$/, '/')
    : fileURLToPath(new URL('../../dist/gitplore/browser/', import.meta.url));

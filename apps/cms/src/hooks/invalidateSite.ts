import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload';
import { siteStore } from '../site/data/store';

/**
 * Throws away the in-memory snapshot of the public site, so the next request reloads it. Runs on every change, not only
 * publishes: unpublishing, a deleted tag or a renamed category change the public pages too. These hooks never await a
 * reload and never throw; a failed reload is the store's problem, not the editor's save.
 */
const invalidate = () => {
  try {
    siteStore().invalidate();
  } catch {
    /* the snapshot also refreshes on its own after a minute */
  }
};

export const invalidateAfterChange: CollectionAfterChangeHook = ({ doc }) => {
  invalidate();
  return doc;
};

export const invalidateAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  invalidate();
  return doc;
};

export const invalidateAfterGlobalChange: GlobalAfterChangeHook = ({ doc }) => {
  invalidate();
  return doc;
};

/**
 * Which camera rig places the view (IMPLEMENTATION_PLAN.md §2, §6).
 *
 * It lives here because both sides need it and neither may own it: `@engine` must not import
 * `@ui`, and `@ui` has no business reaching into `@engine` for a type. Two declarations of the
 * same union would drift the day a third mode is added, so there is exactly one.
 */
export type ViewMode = 'first' | 'third';

/** Every mode there is. Also what validates the value read back out of storage. */
export const VIEW_MODES: readonly ViewMode[] = ['first', 'third'];

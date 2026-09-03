/**
 * The focus ring for the elements this app draws itself.
 *
 * Everything that is a library component (`Button`, `ActionButton`, `Input`,
 * `Checkbox`, …) already carries the ring and must not repeat it. What is left
 * are the handful of surfaces with no library equivalent -- inline text links,
 * the weekday chips, a collapsible header -- and those use these constants so
 * the gap between the control and the ring is the same 2px everywhere.
 *
 * These mirror `FOCUS_RING` / `FOCUS_RING_INSET` / `FOCUS_RING_NONE` from
 * `@stefgo/react-ui-components`. Once a release that exports them is installed,
 * replace this file with a re-export -- the strings must not drift apart.
 */

/** The default: a ring 2px outside the control. */
export const FOCUS_RING =
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** For elements with no room around them -- rows, full-width headers, tabs. */
export const FOCUS_RING_INSET =
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary";

/**
 * Suppresses the browser's own ring, for menu entries that mark focus by
 * background instead. Chrome draws its ring with a white contrast stroke, which
 * on a dark surface reads as a white halo.
 */
export const FOCUS_RING_NONE = "focus:outline-none";

/*
 * The reminder that removes this file.
 *
 * The note above has no teeth on its own: once the release lands, nothing
 * fails, nobody rereads the header, and the two copies drift -- which is the
 * one failure mode a duplicated constant actually has.
 *
 * So the condition is checked by the compiler. The path points at the
 * *installed* package on purpose, not at the bare specifier: under
 * `tsconfig.local-ui.json` that specifier resolves to the sibling checkout,
 * which already exports the constants, and the guard would fire while the
 * installed package -- the one the app ships against -- still lacks them.
 *
 * When `npm run typecheck` fails here: delete this file and import
 * `FOCUS_RING`, `FOCUS_RING_INSET` and `FOCUS_RING_NONE` from
 * `@stefgo/react-ui-components` in the eight files that use them.
 */
type InstalledLibrary = typeof import("../../../../node_modules/@stefgo/react-ui-components");

export const LOCAL_FOCUS_CONSTANTS_STILL_NEEDED: "FOCUS_RING" extends keyof InstalledLibrary
    ? "The installed @stefgo/react-ui-components exports the focus constants now. Delete src/styles/focus.ts and import them from the library."
    : true = true;

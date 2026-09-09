import { createRequire } from "node:module";
import installedPreset from "@stefgo/react-ui-components/tailwind-preset";

const require = createRequire(import.meta.url);

// Working against the library source instead of the installed package. Must be
// set together with VITE_USE_LOCAL_UI, or Tailwind scans one copy of the
// library while Vite bundles another and classes go missing from the output.
const localUiPath =
    process.env.VITE_UI_COMPONENTS_PATH || "../../../react-ui-components";
const useLocalUi = process.env.VITE_USE_LOCAL_UI === "true";

/*
 * The preset has to be swapped too, not just the content glob.
 *
 * It carries the theme -- the tokens, and `borderColor.DEFAULT`, which
 * Tailwind's preflight paints on every element. Loading it from `node_modules`
 * while bundling components from the sibling checkout meant a preset change
 * was invisible in the local-UI build: the components were the new ones, the
 * theme underneath them was the published one, and the difference showed up as
 * a colour nobody could find in the source.
 */
const preset = useLocalUi
    ? require(`${localUiPath}/tailwind-preset.js`)
    : installedPreset;

const localUiContent = useLocalUi ? [`${localUiPath}/src/**/*.{ts,tsx}`] : [];

/** @type {import('tailwindcss').Config} */
export default {
    // `darkMode` and `safelist` come from the preset -- Tailwind merges those.
    // `content` it does NOT merge: a `content` here replaces the preset's
    // entirely, so the library's own dist glob has to be spread back in by
    // hand. Without it every class only the library uses (`w-64` for the
    // sidebar, its grid and positioning utilities) is missing from the output
    // and the layout collapses.
    presets: [preset],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        ...preset.content,
        ...localUiContent,
    ],
    theme: {
        extend: {
            // No colours here on purpose: every role is defined once in the
            // library preset and redefined per theme in its .dark block.
            fontFamily: {
                sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};

import preset from "@stefgo/react-ui-components/tailwind-preset";

// Working against the library source instead of the installed package. Must be
// set together with VITE_USE_LOCAL_UI, or Tailwind scans one copy of the
// library while Vite bundles another and classes go missing from the output.
const localUiContent =
    process.env.VITE_USE_LOCAL_UI === "true"
        ? [
              `${process.env.VITE_UI_COMPONENTS_PATH || "../../../react-ui-components"}/src/**/*.{ts,tsx}`,
          ]
        : [];

/** @type {import('tailwindcss').Config} */
export default {
    // `darkMode` and the library's own dist glob come from the preset.
    presets: [preset],
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", ...localUiContent],
    theme: {
        extend: {
            colors: {
                app: {
                    "text-footer": "#444444",
                },
            },
            fontFamily: {
                sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};

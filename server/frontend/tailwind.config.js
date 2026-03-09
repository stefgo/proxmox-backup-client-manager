const path = require("path");

// Resolve the installed UI library path to scan its dist files for Tailwind classes.
// This is necessary because Tailwind preset content merging is unreliable in Docker/BuildKit.
const uiLibDist = path.join(
    path.dirname(
        require.resolve("@stefgo/react-ui-components/tailwind-preset"),
    ),
    "dist/**/*.{js,mjs,jsx,tsx}",
);

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", uiLibDist],
    presets: [require("@stefgo/react-ui-components/tailwind-preset")],
    theme: {
        extend: {
            colors: {
                // Custom color palette for "Premium Design"
                proxmox: {
                    dark: "#1e1e1e",
                    light: "#f5f5f5",
                    accent: "#E57000", // Proxmox Orange-ish
                },
            },
        },
    },
    plugins: [],
};

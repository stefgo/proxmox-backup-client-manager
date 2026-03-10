const path = require("path");

// Resolve the UI library's dist path to scan for Tailwind utility classes.
// This ensures all CSS classes used by the library's components are generated.
const uiLibDist = path.join(
    path.dirname(
        require.resolve("@stefgo/react-ui-components/tailwind-preset"),
    ),
    "dist/**/*.{js,mjs}",
);

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", uiLibDist],
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

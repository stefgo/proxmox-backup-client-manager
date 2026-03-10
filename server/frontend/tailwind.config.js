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
                app: {
                    // Core colors
                    accent: "#E54D0D",
                    "accent-hover": "#ff5f1f",

                    // Surface definitions for "Premium Design"
                    bg: "#121212", // Main background
                    card: "#1e1e1e", // Cards / Panels
                    input: "#252525", // Form fields
                    border: "#333333", // Standard border color

                    // Text hierarchy
                    "text-main": "#e0e0e0",
                    "text-muted": "#888888",
                    "text-footer": "#444444",

                    // Aliases for compatibility
                    light: "#f5f5f5",
                    dark: "#1e1e1e",
                },
            },
            fontFamily: {
                sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
            },
            boxShadow: {
                "glow-accent": "0 0 15px rgba(229, 77, 13, 0.3)",
                "glow-online": "0 0 12px rgba(34, 197, 94, 0.4)",
                premium:
                    "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
            },
            animation: {
                "pulse-soft":
                    "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "fade-in": "fade-in 0.3s ease-out forwards",
            },
            keyframes: {
                "pulse-soft": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.7 },
                },
                "fade-in": {
                    "0%": { opacity: 0, transform: "translateY(10px)" },
                    "100%": { opacity: 1, transform: "translateY(0)" },
                },
            },
        },
    },
    plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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

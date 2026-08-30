import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist"]),
    // Config files at the workspace root (vite, tailwind, postcss and this file).
    {
        files: ["**/*.{js,jsx}"],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaVersion: "latest",
                ecmaFeatures: { jsx: true },
                sourceType: "module",
            },
        },
        rules: {
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
        },
    },
    // The application itself. Until this block existed the config only matched
    // js/jsx, so none of src/ was ever linted -- which is why react-hooks never
    // reported the incomplete dependency arrays it now flags.
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
            parserOptions: {
                ecmaVersion: "latest",
                ecmaFeatures: { jsx: true },
                sourceType: "module",
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" },
            ],
            // All pre-existing debt across src/, reported so it stays visible but not
            // blocking. Fixing them is its own pass, not a lint-config change.
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            // React Compiler rules, new in eslint-plugin-react-hooks v7. They flag the
            // fetch-in-effect-then-setState pattern this app is built on; the report
            // survives reordering the declaration, so it needs the effect restructured
            // rather than a quick edit.
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/immutability": "warn",
            // Every context here deliberately exports its provider next to its hook
            // (useAuth, useTheme, useWebSocket). That costs Fast Refresh in those three
            // files and nothing else, so it stays a hint rather than a build blocker.
            "react-refresh/only-export-components": "warn",
        },
    },
]);

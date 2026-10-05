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
                // The editor's ESLint server loads this config and the root one in
                // the same process; without an explicit root the parser sees two
                // inferred candidates and refuses every file.
                tsconfigRootDir: import.meta.dirname,
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
            // The frontend is single-quoted (see CLAUDE.md); without a formatter nothing
            // held it, and thirteen files had drifted to double quotes. `avoidEscape`
            // keeps "it's" readable. The core rule is deprecated and goes with ESLint 11
            // -- then `@stylistic/quotes` takes the same options.
            quotes: ["error", "single", { avoidEscape: true }],
        },
    },
]);

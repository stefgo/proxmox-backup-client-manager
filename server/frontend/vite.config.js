import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

// Get version from environment or git
const getVersion = () => {
    if (process.env.VITE_APP_VERSION) {
        return process.env.VITE_APP_VERSION;
    }
    try {
        // Try to get exact tag
        try {
            return execSync("git describe --tags --exact-match --dirty", {
                stdio: "pipe",
            })
                .toString()
                .trim();
        } catch {
            // Not a tag, use branch + hash
            const branch = execSync("git rev-parse --abbrev-ref HEAD")
                .toString()
                .trim();
            const hash = execSync("git rev-parse --short HEAD")
                .toString()
                .trim();
            const dirty = execSync("git status --porcelain").toString().trim()
                ? "-dirty"
                : "";
            return `${branch}-${hash}${dirty}`;
        }
    } catch (e) {
        return "unknown";
    }
};

const APP_VERSION = getVersion();

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
                secure: false,
                ws: true,
                configure: (proxy, options) => {
                    proxy.on("error", (err, req, res) => {
                        if (err.code === "EPIPE") {
                            // Ignore EPIPE
                            return;
                        }
                        console.log("proxy error", err);
                    });
                },
            },
            "/ws": {
                target: "ws://localhost:3000",
                changeOrigin: true,
                secure: false,
                ws: true,
                configure: (proxy, options) => {
                    proxy.on("error", (err, req, res) => {
                        if (err.code === "EPIPE") {
                            // Ignore EPIPE
                            return;
                        }
                        console.log("proxy error", err);
                    });
                },
            },
        },
    },
    resolve: {
        alias: {
            // Only alias to local source during development (vite dev) AND if VITE_USE_LOCAL_UI is not 'false'
            ...(command === "serve" && process.env.VITE_USE_LOCAL_UI !== "false"
                ? {
                      "@stefgo/react-ui-components":
                          "/Users/stefan/Entwicklung/react-ui-components/src/index.ts",
                  }
                : {}),
        },
        dedupe: ["react", "react-dom"],
    },
}));

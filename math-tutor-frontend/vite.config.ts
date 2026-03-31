import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vite.dev/config/
export default defineConfig(() => {
  const useHttps = process.env.VITE_DEV_HTTPS === "1";
  const buildSourcemap = process.env.VITE_BUILD_SOURCEMAP === "1";
  return {
    plugins: [
    react(),
    legacy({
      targets: ["defaults", "not IE 11"],
      modernPolyfills: true,
    }),
    ...(useHttps ? [basicSsl()] : []),
  ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
        react: resolve(__dirname, "node_modules/react"),
        "react-dom": resolve(__dirname, "node_modules/react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
    server: {
      https: useHttps ? {} : undefined,
      host: true,
      port: 5173,
      strictPort: true,
      hmr: {
        protocol: "ws",
        clientPort: 5173,
        host: process.env.VITE_HMR_HOST || undefined,
      },
    },
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    optimizeDeps: {
      include: ["react", "react-dom"],
    },
    build: {
      sourcemap: buildSourcemap,
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("/@mui/material/") ||
              id.includes("/@mui/icons-material/") ||
              id.includes("/@emotion/react/") ||
              id.includes("/@emotion/styled/")
            ) {
              return "vendor-ui";
            }
            if (
              id.includes("/jspdf/") ||
              id.includes("/jszip/") ||
              id.includes("/html2canvas/")
            ) {
              return "vendor-export";
            }
            if (id.includes("/mathjs/")) {
              return "vendor-math";
            }
            return undefined;
          },
        },
      },
    },
  };
});

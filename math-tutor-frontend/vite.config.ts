import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { setupMockServer } from "./src/mock/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vite.dev/config/
export default defineConfig(() => {
  const useHttps = process.env.VITE_DEV_HTTPS === "1";
  const plugins: PluginOption[] = [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    {
      name: "mock-api",
      configureServer(server) {
        setupMockServer(server);
      },
      configurePreviewServer(server) {
        setupMockServer(server);
      },
    },
  ];
  return {
    plugins,
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
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-ui": [
              "@mui/material",
              "@mui/icons-material",
              "@emotion/react",
              "@emotion/styled",
            ],
          },
        },
      },
    },
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Relative assets are required when Electron loads the renderer from file://.
  base: "./",
  resolve: {
    alias: {
      "@serverlab/shared": path.resolve(
        import.meta.dirname,
        "../../packages/shared/src/index.ts"
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/@codemirror") ||
            id.includes("node_modules/@uiw")
          ) {
            return "editor";
          }
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) {
            return "charts";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "motion";
          }
          return undefined;
        },
      },
    },
  },
});

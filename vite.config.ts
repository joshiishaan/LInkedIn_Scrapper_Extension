import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: mode !== "content",
      rollupOptions: {
        input:
          mode === "content"
            ? resolve(__dirname, "src/content/index.tsx")
            : {
                popup: resolve(__dirname, "public/popup.html"),
                background: resolve(__dirname, "src/background/index.ts"),
              },
        output:
          mode === "content"
            ? {
                format: "iife",
                entryFileNames: "content.js",
                inlineDynamicImports: true,
              }
            : {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
              },
      },
    },
  };
});

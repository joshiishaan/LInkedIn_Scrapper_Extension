/**
 * Vite Build Configuration
 * Configures separate builds for popup, background, and content scripts
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: mode !== "content", // Don't clear dist for content build
      rollupOptions: {
        // Different entry points based on build mode
        input:
          mode === "content"
            ? resolve(__dirname, "src/content/index.tsx")
            : {
                popup: resolve(__dirname, "public/popup.html"),
                background: resolve(__dirname, "src/background/index.ts"),
              },
        // Different output formats for content vs main build
        output:
          mode === "content"
            ? {
                format: "iife", // Self-executing for content script
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

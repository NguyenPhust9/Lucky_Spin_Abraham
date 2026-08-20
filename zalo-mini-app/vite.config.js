import { defineConfig } from "vite";

export default defineConfig({
  base: "./",

  build: {
    polyfillModulePreload: false,

    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].module.js",
        chunkFileNames: "assets/[name].[hash].module.js"
      }
    }
  }
});
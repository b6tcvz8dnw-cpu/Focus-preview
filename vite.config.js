import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";

const copyPwaIcons = {
  name: "focus-copy-pwa-icons",
  apply: "build",
  async generateBundle() {
    for (const fileName of ["icon-192.png", "icon-512.png"]) {
      const source = await readFile(new URL(`./${fileName}`, import.meta.url));
      this.emitFile({ type: "asset", fileName, source });
    }
  }
};

export default defineConfig({
  // Relative URLs keep the app working at GitHub Pages' /Focus/ project path.
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
    target: "es2020"
  },
  plugins: [copyPwaIcons]
});

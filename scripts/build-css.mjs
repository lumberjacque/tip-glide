import { copyFile } from "node:fs/promises";
import { build } from "esbuild";

// Minify only shipped CSS; retain readable ESM for consumer bundlers and debugging.
await build({
  entryPoints: ["src/style.css", "src/base.css", "src/native.css"],
  bundle: true,
  minify: true,
  outdir: "dist",
});

await copyFile("src/astro.astro", "dist/astro.astro");

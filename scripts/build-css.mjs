import { build } from "esbuild";

// Minify only shipped CSS; retain readable ESM for consumer bundlers and debugging.
await build({
  entryPoints: ["src/style.css", "src/base.css"],
  bundle: true,
  minify: true,
  outdir: "dist",
});

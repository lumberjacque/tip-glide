import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const rows = [];
const override = process.argv.find((arg) => arg.startsWith("--base-budget="));
const baseBudget = override ? Number(override.split("=")[1]) : 4800;
if (!Number.isSafeInteger(baseBudget) || baseBudget <= 0)
  throw new RangeError("--base-budget must be a positive number of bytes.");
for (const [name, entry, stylesheet, budget] of [
  ["full", "index", "style", 9200],
  ["base", "base", "base", baseBudget],
  ["native", "native", "native", 4600],
  ["scope", "scope", "style", 10000],
  ["rich", "rich", "style", 12000],
]) {
  const result = await build({
    entryPoints: [`dist/${entry}.js`],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    metafile: true,
  });
  const js = result.outputFiles[0].contents;
  const css = await readFile(`dist/${stylesheet}.css`);
  const jsGzip = gzipSync(js).length,
    cssGzip = gzipSync(css).length;
  if (name !== "scope" && name !== "rich")
    assert(
      !Object.keys(result.metafile.inputs).includes("dist/scope.js"),
      `${name} must not bundle application scopes`,
    );
  if (name !== "rich")
    assert(
      !Object.keys(result.metafile.inputs).includes("dist/rich.js"),
      `${name} must not bundle rich renderers`,
    );
  if (name === "base" || name === "native") {
    const inputs = Object.keys(result.metafile.inputs);
    for (const advanced of ["skin.js", "view.js", "options.js", "motion.js"])
      assert(
        !inputs.includes(`dist/${advanced}`),
        `${name} import accidentally includes ${advanced}`,
      );
  }
  rows.push({
    entry: name,
    minifiedJS: js.length,
    gzipJS: jsGzip,
    gzipCSS: cssGzip,
    totalGzip: jsGzip + cssGzip,
    budget,
  });
}
console.table(rows);
for (const row of rows)
  assert(
    row.totalGzip <= row.budget,
    `${row.entry}: ${row.totalGzip} B exceeds the ${row.budget} B gzip budget (JS + CSS).`,
  );
console.log(
  "Decimal bytes; minified consumer bundles; separately gzip-compressed JS and CSS, summed.",
);

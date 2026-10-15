import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Exercise the packed package outside the repository, without development aliases.
const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run check:install.");
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (/^npm_config_(?:workspace|workspaces|include_workspace_root|local_prefix)$/i.test(key))
    delete environment[key];
}
const consumer = await mkdtemp(join(tmpdir(), "tip-glide-consumer-"));
if (
  dirname(resolve(consumer)) !== resolve(tmpdir()) ||
  !basename(consumer).startsWith("tip-glide-consumer-")
)
  throw new Error("Unexpected temporary consumer directory; cleanup refused.");
const runNpm = (args, cwd) =>
  execFileSync(process.execPath, [npmCli, "--workspaces=false", ...args], {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

try {
  const [packed] = JSON.parse(
    runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", consumer], root),
  );
  for (const { path } of packed.files) {
    if (
      !/^(?:dist\/.*\.(?:js|d\.ts)|dist\/(?:style|base)\.css|package\.json|README\.md|CONTRIBUTING\.md|PERFORMANCE\.md|LICENSE)$/.test(
        path,
      )
    )
      throw new Error(`Unexpected published file: ${path}`);
  }
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  runNpm(
    [
      "install",
      join(consumer, packed.filename),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    consumer,
  );
  await writeFile(
    join(consumer, "imports.mjs"),
    `
import { createTipGlide } from "tip-glide";
import { createTipGlide as createBase } from "tip-glide/base";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
if (typeof createTipGlide !== "function") throw new Error("Missing public function export.");
if (typeof createBase !== "function") throw new Error("Missing base function export.");
const require = createRequire(import.meta.url);
if (!readFileSync(require.resolve("tip-glide/style.css"), "utf8").includes(".tg-overlay"))
  throw new Error("Missing tooltip stylesheet.");
if (!readFileSync(require.resolve("tip-glide/base.css"), "utf8").includes(".tg-base"))
  throw new Error("Missing base stylesheet.");
`,
  );
  execFileSync(process.execPath, [join(consumer, "imports.mjs")], {
    cwd: consumer,
    stdio: "inherit",
  });
  await writeFile(
    join(consumer, "types.ts"),
    `
import { createTipGlide, type TipGlide, type TipGlideOptions, type Placement,
  type MotionPreference, type TipAnimation, type TipTransition } from "tip-glide";
import { createTipGlide as createBase, type TipGlideBase, type TipGlideBaseOptions } from "tip-glide/base";
declare const root: HTMLElement;
declare const trigger: HTMLButtonElement;
const placement: Placement = 45;
const motion: MotionPreference = "system";
const enter: TipAnimation = { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 180 };
const exit: TipTransition = "fade";
const options: TipGlideOptions = { placement, motion, enter, exit, arrow: true };
const tips: TipGlide = createTipGlide(root, options);
const remove = tips.add(trigger, "Description");
tips.show(trigger); tips.reposition(); tips.update({ lean: false }); tips.hide();
remove(); tips.destroy();
// @ts-expect-error Placement must be a side or numeric angle.
createTipGlide(root, { placement: "diagonal" });
// @ts-expect-error Tooltip descriptions are plain text.
tips.add(trigger, document.createElement("div"));
const baseOptions: TipGlideBaseOptions = { placement: "top", duration: 180 };
const basic: TipGlideBase = createBase(root, baseOptions);
basic.add(trigger, "Description"); basic.show(trigger); basic.reposition();
basic.update({ motion: "reduced" }); basic.hide(); basic.destroy();
// @ts-expect-error Liquid arrows are only available from the full entry.
createBase(root, { arrow: true });
// @ts-expect-error Numeric 360-degree placement is only available from the full entry.
basic.update({ placement: 45 });
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM"],
        types: [],
        strict: true,
        noEmit: true,
      },
      files: ["types.ts"],
    }),
  );
  const require = createRequire(new URL("../package.json", import.meta.url));
  execFileSync(
    process.execPath,
    [require.resolve("typescript/lib/tsc.js"), "-p", join(consumer, "tsconfig.json")],
    {
      cwd: consumer,
      stdio: "inherit",
    },
  );
  const installed = JSON.parse(
    await readFile(join(consumer, "node_modules/tip-glide/package.json"), "utf8"),
  );
  if (Object.keys(installed.dependencies ?? {}).length)
    throw new Error("Unexpected runtime dependencies.");
  console.log(
    "Installed package: ESM, SSR-safe import, CSS export and consumer declarations checked.",
  );
} finally {
  // This immutable path was checked against the temporary parent before use.
  await rm(consumer, { recursive: true, force: true });
}

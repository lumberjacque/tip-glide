import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access, mkdir } from "node:fs/promises";
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
      !/^(?:dist\/.*\.(?:js|d\.ts|astro|svelte)|dist\/(?:style|base|native)\.css|package\.json|README\.md|CONTRIBUTING\.md|PERFORMANCE\.md|ARCHITECTURE\.md|RICH-CONTENT\.md|LICENSE)$/.test(
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
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const framework of Object.keys(manifest.peerDependencies)) {
    let present = false;
    try {
      await access(join(consumer, "node_modules", framework));
      present = true;
    } catch {}
    if (present) throw new Error(`Plain installation unexpectedly installed ${framework}.`);
    if (!manifest.peerDependenciesMeta[framework]?.optional)
      throw new Error(`Framework peer must be optional: ${framework}.`);
  }
  // Install actual consumer frameworks only after proving the vanilla install stays independent.
  const frameworks = [
    "react",
    "react-dom",
    "@types/react",
    "@types/react-dom",
    "vue",
    "svelte",
    "preact",
    "solid-js",
    "@angular/core",
    "@angular/common",
    "@angular/compiler",
    "@angular/compiler-cli",
    "astro",
    "@astrojs/check",
    "typescript",
  ];
  runNpm(
    [
      "install",
      ...frameworks.map((name) => `${name}@${manifest.devDependencies[name]}`),
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
import { createTipGlideScope } from "tip-glide/scope";
import { createRichTipGlide, createRichTipGlideScope, richContent } from "tip-glide/rich";
const rich = createRichTipGlideScope(); rich.destroy();
if (typeof createRichTipGlide !== "function" || typeof richContent !== "function") throw new Error("Rich SSR import failed");
const scope = createTipGlideScope({ lean: true }); scope.destroy();
import { createTipGlide as createBase } from "tip-glide/base";
import { createTipGlide as createNative, supportsNativeTipGlide } from "tip-glide/native";
import { registerTipGlideElement } from "tip-glide/element";
if (typeof createNative !== "function" || typeof registerTipGlideElement !== "function" || supportsNativeTipGlide()) throw new Error("Native/element SSR import failed");
import "@angular/compiler";
import { TipGlide as ReactGroup } from "tip-glide/react";
import { vTipGlide, createTipGlidePlugin } from "tip-glide/vue";
import { tipGlide, provideTipGlide as provideSvelteTipGlide, useTooltip as useSvelteTooltip } from "tip-glide/svelte";
import { TipGlide as PreactGroup, TipGlideProvider as PreactProvider, useTooltip as usePreactTooltip } from "tip-glide/preact";
import { createTipGlideRef, TipGlideProvider as SolidProvider, tooltip } from "tip-glide/solid";
import { TipGlideDirective } from "tip-glide/angular";
if ([ReactGroup, tipGlide, PreactGroup, createTipGlideRef, TipGlideDirective].some((value) => typeof value !== "function") || !vTipGlide.mounted)
  throw new Error("Missing framework export.");
if (typeof document !== "undefined") throw new Error("SSR import unexpectedly created a DOM.");
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
if (typeof createTipGlide !== "function") throw new Error("Missing public function export.");
if (typeof createBase !== "function") throw new Error("Missing base function export.");
const require = createRequire(import.meta.url);
if (!readFileSync(require.resolve("tip-glide/style.css"), "utf8").includes(".tg-overlay"))
  throw new Error("Missing tooltip stylesheet.");
if (!readFileSync(require.resolve("tip-glide/base.css"), "utf8").includes(".tg-base"))
  throw new Error("Missing base stylesheet.");
if (!readFileSync(require.resolve("tip-glide/native.css"), "utf8").includes(".tg-native"))
  throw new Error("Missing native stylesheet.");
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
import { createTipGlide as createNative, type TipGlideNativeOptions } from "tip-glide/native";
import { createTipGlideScope } from "tip-glide/scope";
import { createRichTipGlide, createRichTipGlideScope, richContent } from "tip-glide/rich";
const richScope = createRichTipGlideScope({ lean: true });
declare const badge: HTMLElement;
richScope.attach(badge, richContent("Pro plan", badge));
createRichTipGlide(badge).setContent(badge, richContent("Plan", host => { host.textContent = "Badge"; return () => {}; }));
// @ts-expect-error Rich content requires DOM or a renderer, never an HTML string.
richContent("Pro", "<b>Pro</b>");
import { createElement } from "react";
import { TipGlide as ReactGroup, useTipGlide, TipGlideProvider as ReactProvider, useTooltip as useReactTooltip, type TipGlideAdapterOptions } from "tip-glide/react";
import { vTipGlide, createTipGlidePlugin } from "tip-glide/vue";
import { tipGlide, provideTipGlide as provideSvelteTipGlide, useTooltip as useSvelteTooltip } from "tip-glide/svelte";
import { TipGlide as PreactGroup, TipGlideProvider as PreactProvider, useTooltip as usePreactTooltip } from "tip-glide/preact";
import { createTipGlideRef, TipGlideProvider as SolidProvider, tooltip } from "tip-glide/solid";
import { TipGlideDirective } from "tip-glide/angular";
createElement(ReactProvider, { options: { lean: true, warmDuration: 900 } });
useReactTooltip<HTMLButtonElement>("Save");
// @ts-expect-error Tooltip bindings accept text, not options or arbitrary objects.
useReactTooltip({ lean: true });
const adapted: TipGlideAdapterOptions = { boundary: "root", alwaysVisible: true, arrow: true };
createElement(ReactGroup, { options: adapted });
useTipGlide<HTMLDivElement>(adapted);
createTipGlideRef(() => adapted);
void [vTipGlide, tipGlide, PreactGroup, TipGlideDirective, SolidProvider, tooltip, provideSvelteTipGlide, useSvelteTooltip, PreactProvider, usePreactTooltip, createTipGlidePlugin];
// @ts-expect-error Adapters accept only a root boundary or actual element.
const invalid: TipGlideAdapterOptions = { boundary: "viewport" };
void invalid;
declare const root: HTMLElement;
declare const trigger: HTMLButtonElement;
const appScope = createTipGlideScope({ lean: true, warmDuration: 800 });
const registration = appScope.attach(trigger, "Save"); registration.update(null); registration.destroy(); appScope.destroy();
// @ts-expect-error Scope bindings accept plain text, not HTML elements.
appScope.attach(trigger, document.createElement("div"));

const placement: Placement = 45;
const motion: MotionPreference = "system";
const enter: TipAnimation = { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 180 };
const exit: TipTransition = "fade";
const options: TipGlideOptions = { placement, motion, enter, exit, arrow: true };
const tips: TipGlide = createTipGlide(root, options);
const remove = tips.add(trigger, "Description");
tips.show(trigger); tips.setContent(trigger, "Updated"); tips.reposition(); tips.update({ lean: false }); tips.hide();
remove(); tips.destroy();
// @ts-expect-error Placement must be a side or numeric angle.
createTipGlide(root, { placement: "diagonal" });
// @ts-expect-error Tooltip descriptions are plain text.
tips.add(trigger, document.createElement("div"));
const nativeOptions: TipGlideNativeOptions = { placement: "right", touch: "tap", hideOnDrag: false };
const native = createNative(root, nativeOptions); native.update({ touch: "none" }); native.destroy();
// @ts-expect-error Native placement does not include geometric pointers.
createNative(root, { arrow: true });
// @ts-expect-error Native placement fades; it does not expose a glide duration.
createNative(root, { duration: 180 });
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
        skipLibCheck: true,
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
  await writeFile(
    join(consumer, "angular-consumer.ts"),
    `
import { Component } from "@angular/core";
import { TipGlideDirective, TipGlideGroupDirective, provideTipGlide, type TipGlideAdapterOptions } from "tip-glide/angular";
export const providers = [provideTipGlide({ lean: true, warmDuration: 900 })];
@Component({ standalone: true, imports: [TipGlideDirective, TipGlideGroupDirective], template: '<button [tipGlide]="text">Save</button><button tipGlide="Static text">Info</button><nav [tipGlideGroup]="options"><button data-tip="Save">Save</button></nav>' })
export class Toolbar { text: string | null = "Dynamic text"; readonly options: TipGlideAdapterOptions = { arrow: true, boundary: "root" }; }
`,
  );
  await writeFile(
    join(consumer, "tsconfig.angular.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { noEmit: false, experimentalDecorators: true, outDir: "./angular-output" },
      angularCompilerOptions: { compilationMode: "full", strictTemplates: true },
      files: ["angular-consumer.ts"],
    }),
  );
  const consumerRequire = createRequire(join(consumer, "package.json"));
  const ngc = join(
    dirname(consumerRequire.resolve("@angular/compiler-cli/package.json")),
    "bundles/src/bin/ngc.js",
  );
  execFileSync(process.execPath, [ngc, "-p", "tsconfig.angular.json"], {
    cwd: consumer,
    stdio: "inherit",
  });

  await mkdir(join(consumer, "src/pages"), { recursive: true });
  await writeFile(
    join(consumer, "src/pages/index.astro"),
    `---
import TipGlide from 'tip-glide/astro';
import Tooltip from 'tip-glide/astro/Tooltip.astro';
---
<TipGlide options={{ arrow: true, boundary: 'root' }}><button data-tip="Save">Save</button><Tooltip description="Pro plan"><button slot="trigger">Plan</button><strong>Pro</strong></Tooltip></TipGlide>
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({ extends: "astro/tsconfigs/strict" }),
  );
  runNpm(["exec", "--", "astro", "check"], consumer);
  runNpm(["exec", "--", "astro", "build"], consumer);
  const html = await readFile(join(consumer, "dist/index.html"), "utf8");
  if (!html.includes("tip-glide-group") || !html.includes('data-tip="Save"'))
    throw new Error("Packed Astro component did not render its group and slot.");
  const installed = JSON.parse(
    await readFile(join(consumer, "node_modules/tip-glide/package.json"), "utf8"),
  );
  if (Object.keys(installed.dependencies ?? {}).length)
    throw new Error("Unexpected runtime dependencies.");
  console.log(
    "Installed package: vanilla isolation, seven framework exports, SSR, types, Angular AOT and Astro consumer checked.",
  );
} finally {
  // This immutable path was checked against the temporary parent before use.
  await rm(consumer, { recursive: true, force: true });
}

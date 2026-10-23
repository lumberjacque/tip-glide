import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Test the distributable with each consumer's own compiler and runtime.
const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run through npm run check:angular.");
const versions = process.argv.slice(2);
if (!versions.length) versions.push("20.0.0", "20", "21", "22");
if (versions.some((version) => !/^(20|21|22)(?:\.\d+\.\d+)?$/.test(version)))
  throw new Error("Expected an Angular 20, 21 or 22 version.");
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (/^npm_config_(?:workspace|workspaces|include_workspace_root|local_prefix)$/i.test(key))
    delete environment[key];
}
const directory = await mkdtemp(join(tmpdir(), "tip-glide-angular-"));
if (
  dirname(resolve(directory)) !== resolve(tmpdir()) ||
  !basename(directory).startsWith("tip-glide-angular-")
)
  throw new Error("Unexpected temporary directory; cleanup refused.");
const npm = (args, cwd) =>
  execFileSync(process.execPath, [npmCli, "--workspaces=false", ...args], {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
const run = (args, cwd) => execFileSync(process.execPath, args, { cwd, stdio: "inherit" });
try {
  const [packed] = JSON.parse(
    npm(["pack", "--json", "--ignore-scripts", "--pack-destination", directory], root),
  );
  for (const version of versions) {
    const consumer = join(directory, version);
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    const typescript = version.startsWith("20")
      ? "5.8.3"
      : version.startsWith("21")
        ? "5.9.3"
        : "~6.0.0";
    npm(
      [
        "install",
        join(directory, packed.filename),
        ...["core", "common", "compiler", "compiler-cli", "platform-browser"].map(
          (name) => `@angular/${name}@${version}`,
        ),
        `typescript@${typescript}`,
        "happy-dom@20.14.5",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      consumer,
    );
    const require = createRequire(join(consumer, "package.json"));
    await writeFile(
      join(consumer, "ssr.mjs"),
      `
import "@angular/compiler";
import { provideTipGlide, TipGlideDirective, TipGlideGroupDirective } from "tip-glide/angular";
provideTipGlide({ lean: true });
if (typeof document !== "undefined" || !TipGlideDirective || !TipGlideGroupDirective) throw new Error("SSR import failed");
`,
    );
    run(["ssr.mjs"], consumer);
    await writeFile(
      join(consumer, "toolbar.ts"),
      `
import { Component, Input, signal } from "@angular/core";
import { TipGlideDirective, TipGlideGroupDirective } from "tip-glide/angular";
@Component({ standalone: true, imports: [TipGlideDirective, TipGlideGroupDirective],
  template: '<button [tipGlide]="text()">Save</button><button tipGlide="Static">Info</button><button [tipGlide]="plain">Bound input</button><nav [tipGlideGroup]="options"><button data-tip="Local">Local</button></nav>' })
export class Toolbar {
  text = signal<string | null>("First");
  @Input() plain = "Plain";
  options = { className: "local" };
}
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
          experimentalDecorators: true,
          outDir: "out",
        },
        angularCompilerOptions: { compilationMode: "full", strictTemplates: true },
        files: ["toolbar.ts"],
      }),
    );
    run(
      [
        join(
          dirname(require.resolve("@angular/compiler-cli/package.json")),
          "bundles/src/bin/ngc.js",
        ),
        "-p",
        "tsconfig.json",
      ],
      consumer,
    );
    await writeFile(
      join(consumer, "runtime.mjs"),
      `
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window();
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "ResizeObserver", "DOMRect", "Event", "FocusEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  const value = key === "window" ? window : window[key];
  Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === "function" && /^[a-z]/.test(key) ? value.bind(window) : value });
}
await import("@angular/compiler");
const angular = await import("@angular/core");
const { TestBed } = await import("@angular/core/testing");
const { BrowserTestingModule, platformBrowserTesting } = await import("@angular/platform-browser/testing");
const { provideTipGlide } = await import("tip-glide/angular");
const { Toolbar } = await import("./out/toolbar.js");
const zoneless = angular.provideZonelessChangeDetection ?? angular.provideExperimentalZonelessChangeDetection;
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
try {
  TestBed.configureTestingModule({ imports: [Toolbar], providers: [zoneless(), provideTipGlide({ className: "shared", lean: true, warmDuration: 800 })] });
  const fixture = TestBed.createComponent(Toolbar);
  fixture.detectChanges(); await fixture.whenStable();
  const descriptions = () => Array.from(document.querySelectorAll(".tg-description"), (node) => node.textContent).sort();
  assert.deepEqual(descriptions(), ["First", "Local", "Plain", "Static"]);
  assert.equal(document.querySelectorAll(".tg-overlay").length, 2);
  // Happy DOM has no layout; supply visible rectangles for focus-triggered rendering.
  for (const trigger of fixture.nativeElement.querySelectorAll("button")) {
    const rect = new window.DOMRect(100, 200, 60, 40);
    trigger.getBoundingClientRect = () => rect;
    trigger.getClientRects = () => [rect];
  }
  const button = fixture.nativeElement.querySelector("button");
  button.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  assert.equal(document.querySelectorAll(".tg-overlay.shared").length, 1);
  fixture.nativeElement.querySelector("nav button").dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  assert.equal(document.querySelectorAll(".tg-overlay.local").length, 1);
  const description = button.getAttribute("aria-describedby");
  fixture.componentInstance.text.set("Changed");
  fixture.componentRef.setInput("plain", "Changed input");
  fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable();
  assert.deepEqual(descriptions(), ["Changed", "Changed input", "Local", "Static"]);
  assert.equal(button.getAttribute("aria-describedby"), description);
  fixture.componentInstance.text.set(null);
  fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable();
  assert.deepEqual(descriptions(), ["Changed input", "Local", "Static"]);
  assert.equal(button.hasAttribute("aria-describedby"), false);
  fixture.destroy();
  assert.equal(document.querySelectorAll(".tg-overlay, .tg-description").length, 0);
} finally {
  TestBed.resetTestingModule(); await window.happyDOM.close();
}
console.log("Angular " + angular.VERSION.full + ": packed AOT, SSR, shared defaults, local groups, updates, accessibility and cleanup passed.");
`,
    );
    run(["runtime.mjs"], consumer);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

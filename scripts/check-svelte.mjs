import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run with npm run check:svelte.");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const directory = await mkdtemp(join(tmpdir(), "tip-glide-svelte-"));
if (
  dirname(resolve(directory)) !== resolve(tmpdir()) ||
  !basename(directory).startsWith("tip-glide-svelte-")
)
  throw new Error("Unexpected temporary directory; cleanup refused.");
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (/^npm_config_(?:workspace|workspaces|include_workspace_root|local_prefix)$/i.test(key))
    delete environment[key];
}
const npm = (args, cwd) =>
  execFileSync(process.execPath, [npmCli, "--workspaces=false", ...args], {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
try {
  const [packed] = JSON.parse(
    npm(["pack", "--json", "--ignore-scripts", "--pack-destination", directory], root),
  );
  for (const version of ["4", "5"]) {
    const consumer = join(directory, version);
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    npm(
      [
        "install",
        join(directory, packed.filename),
        `svelte@${version}`,
        "svelte-check@4.7.7",
        "typescript@5.8.3",
        `esbuild@${manifest.devDependencies.esbuild}`,
        `happy-dom@${manifest.devDependencies["happy-dom"]}`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      consumer,
    );
    await writeFile(
      join(consumer, "App.svelte"),
      `
<script lang="ts">
import { provideTipGlide } from 'tip-glide/svelte';
import Tooltip from 'tip-glide/svelte/Tooltip.svelte';
import type { Writable } from 'svelte/store';
export let state: Writable<string>;
provideTipGlide({ lean: true });
</script>
<Tooltip description={$state}>
  <button slot="trigger" let:tooltip use:tooltip>Plan</button>
  <strong>{$state}</strong>
</Tooltip>
`,
    );
    await writeFile(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          allowJs: true,
          checkJs: false,
        },
        include: ["App.svelte"],
      }),
    );
    npm(["exec", "--", "svelte-check", "--tsconfig", "./tsconfig.json"], consumer);
    await writeFile(
      join(consumer, "entry.mjs"),
      `
import * as svelte from 'svelte';
import { writable } from 'svelte/store';
import App from './App.svelte';
const state = writable('First');
export function start(host) { return ${version === "4" ? "new App({target:host,props:{state}})" : "svelte.mount(App,{target:host,props:{state}})"}; }
export const update = state.set;
export const flush = () => svelte.tick();
export const destroy = app => ${version === "4" ? "app.$destroy()" : "svelte.unmount(app)"};
`,
    );
    await writeFile(
      join(consumer, "check.mjs"),
      `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { compile, preprocess } from 'svelte/compiler';
import ts from 'typescript';
import { Window } from 'happy-dom';
await build({entryPoints:['entry.mjs'],outfile:'bundle.mjs',bundle:true,format:'esm',platform:'browser',conditions:['browser'],plugins:[{
  name:'svelte-source',setup(build){build.onLoad({filter:/\\.svelte$/},async ({path})=>{
    const source=await readFile(path,'utf8');
    const processed=await preprocess(source,{script:({content,attributes})=>attributes.lang==='ts'?{code:ts.transpileModule(content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText}:undefined},{filename:path});
    return {contents:compile(processed.code,{filename:path,generate:'${version === "4" ? "dom" : "client"}'}).js.code,loader:'js'};
  });}
}]});
const window = new Window();
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLOptionElement','HTMLMediaElement','Element','Node','Text','Comment','Document','DocumentFragment','Event','EventTarget','CustomEvent','MutationObserver','ResizeObserver','DOMRect','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']){
  const value=key==='window'?window:window[key];
  Object.defineProperty(globalThis,key,{configurable:true,value:typeof value==='function'&&/^[a-z]/.test(key)?value.bind(window):value});
}
const app = await import('./bundle.mjs');
const root=document.createElement('main');document.body.append(root);
const instance=app.start(root);
try {
  await app.flush();
  const button=root.querySelector('button'),rect=new window.DOMRect(100,200,60,40);
  button.getBoundingClientRect=()=>rect;button.getClientRects=()=>[rect];
  button.dispatchEvent(new window.FocusEvent('focusin',{bubbles:true}));await app.flush();
  const badge=document.querySelector('.tg-content strong'),id=button.getAttribute('aria-describedby');
  assert.equal(badge?.textContent,'First');
  app.update('Changed');await app.flush();
  assert.equal(document.querySelector('.tg-content strong'),badge);
  assert.equal(badge.textContent,'Changed');assert.equal(button.getAttribute('aria-describedby'),id);
  assert.equal(document.getElementById(id).textContent,'Changed');
} finally {await app.destroy(instance);await app.flush();}
assert.equal(document.querySelectorAll('.tg-overlay,.tg-description').length,0);
await window.happyDOM.close();
console.log('Svelte ${version}: packed component types, compilation, reactive slots, ARIA and cleanup passed.');
`,
    );
    execFileSync(process.execPath, ["check.mjs"], { cwd: consumer, stdio: "inherit" });
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

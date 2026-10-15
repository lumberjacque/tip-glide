import { build } from "esbuild";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

// No website server or screenshots. Use installed Edge, or an explicitly supplied browser.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : { channel: process.env.BROWSER_CHANNEL ?? "msedge" }),
});
const rows = [];
const sameSize = process.argv.includes("--same-size");
try {
  for (const profile of [
    { name: "desktop", width: 1280, height: 900, cpu: 1 },
    { name: "mobile / 4x CPU", width: 390, height: 844, cpu: 4 },
  ]) {
    for (const variant of ["control", "base", "full"]) {
      const page = await browser.newPage({
        viewport: { width: profile.width, height: profile.height },
      });
      await page.bringToFront();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
      await session.send("Performance.enable");
      const js =
        variant === "control"
          ? ""
          : (
              await build({
                entryPoints: [variant === "base" ? "dist/base.js" : "dist/index.js"],
                bundle: true,
                minify: true,
                format: "iife",
                globalName: "TipGlide",
                write: false,
              })
            ).outputFiles[0].text;
      const css =
        variant === "control"
          ? ""
          : await readFile(`dist/${variant === "base" ? "base" : "style"}.css`, "utf8");
      await page.setContent(`<!doctype html><html><head><style>
        body{margin:24px;font:14px system-ui;background:#f8f8f8}
        #root{display:grid;grid-template-columns:repeat(4,1fr);gap:48px 8px;padding-top:160px}
        button{height:36px;min-width:0}
        ${css}
      </style></head><body><div id="root"></div><script>${js}</script></body></html>`);
      const setup = await page.evaluate(
        ({ entry, fixedSize }) => {
          const root = document.querySelector("#root"),
            buttons = [];
          for (let i = 0; i < 1000; i++) {
            const button = document.createElement("button");
            button.textContent = `Item ${i}`;
            button.dataset.tip = fixedSize
              ? "A shared tooltip size"
              : i % 2
                ? "Short tooltip"
                : "A longer tooltip that wraps naturally when it moves across a narrow viewport.";
            root.append(button);
            buttons.push(button);
          }
          // Instrument library scheduling, while the harness uses the original rAF.
          const nativeFrame = window.requestAnimationFrame.bind(window);
          const nativeCancel = window.cancelAnimationFrame.bind(window);
          const pending = new Set();
          let peak = 0,
            callbacks = 0,
            viewBoxWrites = 0,
            pathWrites = 0;
          const setAttribute = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (name, value) {
            if (this instanceof SVGElement) {
              if (name === "viewBox") viewBoxWrites++;
              if (name === "d") pathWrites++;
            }
            return setAttribute.call(this, name, value);
          };
          window.requestAnimationFrame = (callback) => {
            const id = nativeFrame((now) => {
              pending.delete(id);
              callbacks++;
              callback(now);
            });
            pending.add(id);
            peak = Math.max(peak, pending.size);
            return id;
          };
          window.cancelAnimationFrame = (id) => {
            pending.delete(id);
            nativeCancel(id);
          };
          const start = performance.now();
          const tips =
            entry === "control"
              ? { show() {}, destroy() {} }
              : window.TipGlide.createTipGlide(
                  root,
                  entry === "full" ? { openDelay: 0, arrow: true, lean: true } : { openDelay: 0 },
                );
          const initMs = performance.now() - start;
          window.fixture = {
            tips,
            buttons,
            nativeFrame,
            pending,
            stats: () => ({ peak, callbacks, viewBoxWrites, pathWrites }),
            resetStats: () => {
              peak = 0;
              callbacks = 0;
              viewBoxWrites = 0;
              pathWrites = 0;
            },
          };
          return { initMs, nodes: document.querySelectorAll(".tg-overlay *").length };
        },
        { entry: variant, fixedSize: sameSize },
      );
      // Warm the rendering path before measuring; do not mistake first-use JIT work for steady state.
      await page.evaluate(async () => {
        const { tips, buttons, nativeFrame } = window.fixture;
        for (let i = 0; i < 16; i++) {
          tips.show(buttons[i % 8]);
          await new Promise(nativeFrame);
        }
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => window.fixture.resetStats());
      const before = (await session.send("Performance.getMetrics")).metrics;
      const result = await page.evaluate(async () => {
        const { tips, buttons, nativeFrame } = window.fixture;
        const intervals = [],
          calls = [];
        let previous,
          changes = 0;
        for (let frame = 0; frame < 150; frame++) {
          const now = await new Promise(nativeFrame);
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          // A handoff every four native frames, alternating short and wrapped text.
          if (frame % 4 === 0) {
            const start = performance.now();
            tips.show(buttons[changes++ % 8]);
            calls.push(performance.now() - start);
          }
        }
        // oxlint-disable-next-line unicorn/consistent-function-scoping -- Runs inside the browser realm.
        const percentile = (values, p) =>
          values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) * p)];
        const median = percentile(intervals, 0.5);
        return {
          handoffs: changes,
          showP50: percentile(calls, 0.5),
          showP95: percentile(calls, 0.95),
          frameP50: median,
          frameP95: percentile(intervals, 0.95),
          longFramePercent:
            (100 * intervals.filter((ms) => ms > median * 1.5).length) / intervals.length,
        };
      });
      const after = (await session.send("Performance.getMetrics")).metrics;
      await page.waitForTimeout(800);
      if (variant !== "control") {
        const settled = await page.evaluate(() => {
          const position = document.querySelector(".tg-position"),
            clip = document.querySelector(".tg-clip"),
            backdrop = document.querySelector(".tg-backdrop"),
            content = document.querySelector(".tg-content:not(.tg-measure)");
          const rect = position.getBoundingClientRect(),
            clipRect = clip.getBoundingClientRect();
          return {
            visible: getComputedStyle(position).visibility === "visible",
            inside:
              rect.left >= 11.5 &&
              rect.top >= 11.5 &&
              rect.right <= innerWidth - 11.5 &&
              rect.bottom <= innerHeight - 11.5,
            clipped:
              getComputedStyle(clip).overflow === "hidden" &&
              Math.abs(clipRect.width - rect.width) < 0.5,
            backdropFits: Math.abs(backdrop.getBoundingClientRect().width - rect.width) < 0.5,
            padding: getComputedStyle(content).paddingTop,
            font: getComputedStyle(content).fontSize,
          };
        });
        assert.deepEqual(
          settled,
          {
            visible: true,
            inside: true,
            clipped: true,
            backdropFits: true,
            padding: "10px",
            font: "13px",
          },
          "Settled content must stay inside its surface and viewport",
        );
        const customPadding = await page.evaluate(() => {
          const overlay = document.querySelector(".tg-overlay");
          overlay.style.setProperty("--tg-padding", "7px 9px");
          const padding = getComputedStyle(
            document.querySelector(".tg-content:not(.tg-measure)"),
          ).paddingTop;
          overlay.style.removeProperty("--tg-padding");
          return padding;
        });
        assert.equal(customPadding, "7px", "CSS variable overrides must remain available");
      }
      const cleanup = await page.evaluate(() => {
        const { tips, pending, stats } = window.fixture;
        const idleFrames = pending.size,
          work = stats();
        tips.destroy();
        return {
          idleFrames,
          remainingFrames: pending.size,
          ...work,
          remainingNodes: document.querySelectorAll(".tg-overlay,.tg-description").length,
        };
      });
      assert.deepEqual(errors, [], `${profile.name}/${variant}: browser exceptions`);
      assert.equal(cleanup.idleFrames, 0, "Animation must settle without an idle rAF loop");
      assert.equal(cleanup.remainingFrames, 0, "destroy() must cancel queued callbacks");
      assert.equal(cleanup.remainingNodes, 0, "destroy() must remove owned nodes");
      const delta = (name) =>
        1000 *
        ((after.find((metric) => metric.name === name)?.value ?? 0) -
          (before.find((metric) => metric.name === name)?.value ?? 0));
      rows.push({
        profile: profile.name,
        variant,
        initMs: setup.initMs,
        ...result,
        scriptMs: delta("ScriptDuration"),
        layoutMs: delta("LayoutDuration"),
        styleMs: delta("RecalcStyleDuration"),
        idleFrames: cleanup.idleFrames,
        viewBoxWrites: cleanup.viewBoxWrites,
        pathWrites: cleanup.pathWrites,
      });
      await page.close();
    }
  }
  console.table(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "number" ? Math.round(value * 100) / 100 : value,
        ]),
      ),
    ),
  );
  console.log(
    `Browser: ${browser.version()}. 1,000 registered triggers; 150 native frames per case.`,
  );
  console.log(
    "Timings are reports, not CI thresholds. Mobile is viewport + CPU emulation, not a physical phone.",
  );
  console.log("Frame cadence follows the browser; this does not prove 120 Hz on another device.");
  console.log(sameSize ? "Fixed text size workload." : "Alternating short and long text workload.");
} finally {
  await browser.close();
}

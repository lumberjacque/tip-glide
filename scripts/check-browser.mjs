import { build } from "esbuild";
import { chromium, webkit } from "playwright-core";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Real layout, top layer and touch; no website or screenshots required.
const assets = {};
for (const entry of ["index", "base", "native", "rich"]) {
  assets[entry] = {
    js: (
      await build({
        entryPoints: [`dist/${entry}.js`],
        bundle: true,
        format: "iife",
        globalName: "TG",
        write: false,
      })
    ).outputFiles[0].text,
    css: await readFile(
      `dist/${entry === "index" || entry === "rich" ? "style" : entry}.css`,
      "utf8",
    ),
  };
}
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({
    headless: true,
    ...(engine === chromium && process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  try {
    for (const entry of ["index", "base", "native"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(`<!doctype html><style>
        body{margin:0;height:1800px;font:16px system-ui}
        dialog{width:320px;height:600px;padding:0;overflow:hidden}
        button{position:absolute;top:250px;left:100px;width:100px;height:40px}
        #b{top:360px;left:200px} ${assets[entry].css}
      </style><dialog open><button id="a" data-tip="First description">A</button><button id="b" data-tip="A longer description that wraps over multiple lines.">B</button></dialog>
      <script>${assets[entry].js}</script>`);
      const setup = await page.evaluate((kind) => {
        const dialog = document.querySelector("dialog");
        dialog.removeAttribute("open");
        dialog.showModal();
        window.a = document.querySelector("#a");
        window.b = document.querySelector("#b");
        window.reads = 0;
        window.frames = 0;
        const frame = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (fn) => {
          window.frames++;
          return frame(fn);
        };
        if (kind === "native") {
          const rect = a.getBoundingClientRect.bind(a);
          a.getBoundingClientRect = () => {
            window.reads++;
            return rect();
          };
        }
        window.tips = TG.createTipGlide(dialog, {
          openDelay: 0,
          touch: "tap",
          ...(kind === "index" ? { arrow: true, lean: true } : {}),
        });
        a.style.setProperty("anchor-name", "--existing");
        tips.show(a);
        return {
          popover: document.querySelector(".tg-overlay").matches(":popover-open"),
          focus: document.activeElement.id,
        };
      }, entry);
      assert(setup.popover, `${engine.name()}/${entry}: host is not in top layer`);
      await page.waitForTimeout(250);
      const layout = await page.evaluate(() => {
        const tip = document.querySelector(".tg-position"),
          r = tip.getBoundingClientRect();
        const reads = window.reads;
        const aRect = document.querySelector("#a").getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          background: getComputedStyle(tip.querySelector(".tg-backdrop") ?? tip).backgroundColor,
          clear: document.elementFromPoint(aRect.x + 50, aRect.y + 20)?.id === "a",
          reads,
          frames: window.frames,
        };
      });
      assert(layout.clear, `${entry}: transparent overlay blocks trigger`);
      assert(
        layout.width > 40 &&
          layout.height > 20 &&
          layout.x >= 0 &&
          layout.right <= 390 &&
          layout.y >= 0 &&
          layout.bottom <= 844,
        `${entry}: invalid layout ${JSON.stringify(layout)}`,
      );
      if (entry === "native") {
        assert.equal(layout.reads, 0, "Native renderer read trigger layout");
        assert.equal(layout.frames, 0, "Native renderer scheduled animation work");
      }

      const stableId = await page.locator("#a").getAttribute("aria-describedby");
      await page.evaluate(() =>
        tips.setContent(
          a,
          "Live text updates keep the tooltip visible and naturally resize the same surface.",
        ),
      );
      await page.waitForTimeout(350);
      assert.equal(await page.locator("#a").getAttribute("aria-describedby"), stableId);
      assert(
        (await page.locator(".tg-position[data-open]").textContent()).includes("Live text updates"),
        `${entry}: live text update closed the tooltip`,
      );
      // Rapid retargeting, natural size, retained arrow contour and interrupted exit.
      await page.evaluate(() => {
        tips.show(b);
        tips.hide();
        tips.show(a);
        tips.show(b);
      });
      await page.waitForTimeout(400);
      assert(
        await page.locator(".tg-position[data-open]").isVisible(),
        `${entry}: interrupted exit closed new tooltip`,
      );
      if (entry === "index")
        assert((await page.locator(".tg-skin path").getAttribute("d")).includes("Q"));
      // Native placement falls away from the top/left boundary without JS clamping.
      if (entry === "native") {
        await page.evaluate(() => {
          a.style.left = "0";
          a.style.top = "0";
          tips.show(a);
        });
        await page.waitForTimeout(60);
        const edge = await page.locator(".tg-position").boundingBox();
        assert(
          edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 390 && edge.y + edge.height <= 844,
          `Native overflow: ${JSON.stringify(edge)}`,
        );
      }
      // Real touch toggles, content scroll remains possible and outside taps dismiss.
      await page.evaluate(() => {
        tips.hide();
      });
      await page.tap("#b");
      assert(
        await page.locator(".tg-position[data-open]").isVisible(),
        `${entry}: touch did not open`,
      );
      await page.evaluate(() => {
        tips.add(b, "Long text. ".repeat(500));
        tips.show(b);
      });
      const scroll = await page.evaluate(() => {
        const content =
          document.querySelector(".tg-position .tg-content") ??
          document.querySelector(".tg-position");
        content.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
        );
        content.scrollTop = 80;
        return {
          scroll: content.scrollTop,
          open: document.querySelector(".tg-position").hasAttribute("data-open"),
        };
      });
      assert(scroll.open && scroll.scroll > 0, `${entry}: long text scroll dismissed or clipped`);
      if (engine === chromium) {
        await page.waitForTimeout(300);
        const target = page.locator(
          entry === "native" ? ".tg-position" : ".tg-position .tg-content",
        );
        await target.evaluate((node) => {
          node.scrollTop = 0;
        });
        const box = await target.boundingBox();
        const session = await page.context().newCDPSession(page);
        const x = box.x + box.width / 2,
          y = box.y + box.height - 30;
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let step = 1; step <= 10; step++) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - step * 12 }],
          });
          await page.waitForTimeout(17);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(100);
        const swiped = await target.evaluate((node) => node.scrollTop);
        assert(swiped > 10, `${entry}: native swipe did not scroll (${swiped})`);
        await session.detach();
      }

      await page.evaluate(() => {
        b.remove();
      });
      await page.waitForTimeout(30);
      assert.equal(
        await page.locator(".tg-position[data-open]").count(),
        0,
        "Removed active trigger stayed visible",
      );
      await page.evaluate(() => {
        tips.destroy();
      });
      assert.equal(await page.locator(".tg-overlay,.tg-description").count(), 0);
      assert.equal(
        await page.locator("#a").evaluate((a) => a.style.getPropertyValue("anchor-name")),
        "--existing",
      );
      assert.deepEqual(errors, []);
      console.log(
        `${engine.name()} / ${entry}: top layer, layout, interruption, touch, long text, cleanup passed`,
      );
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<!doctype html><style>
      body{margin:0;font:16px system-ui} button{position:absolute;top:300px;left:120px;width:80px;height:40px}
      #b{top:500px;left:260px} ${assets.rich.css}
      .tg-overlay{--tg-max-width:260px;--tg-max-height:180px}
    </style><button id="a">Plan</button><button id="b">Other</button><script>${assets.rich.js}</script>`);
    await page.evaluate(() => {
      window.mounts = 0;
      window.cleanups = 0;
      window.frames = 0;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.frames++;
        return request(callback);
      };
      window.a = document.querySelector("#a");
      window.b = document.querySelector("#b");
      window.tips = TG.createRichTipGlide(document, {
        arrow: true,
        lean: true,
        touch: "tap",
        openDelay: 0,
        duration: 180,
      });
      tips.add(
        a,
        TG.richContent("Pro plan", (host) => {
          mounts++;
          const badge = document.createElement("strong");
          badge.id = "badge";
          badge.textContent = "Pro";
          badge.style.color = "rebeccapurple";
          host.append(badge);
          return () => {
            cleanups++;
          };
        }),
      );
      tips.add(b, "A plain description that wraps across several lines.");
      tips.show(a);
    });
    await page.waitForTimeout(300);
    const first = await page.locator(".tg-position").boundingBox();
    const description = await page.locator("#a").getAttribute("aria-describedby");
    assert(
      first.width > 40 && first.height > 20,
      `${engine.name()}: rich content was not measured`,
    );
    assert.equal(
      await page.locator("#badge").count(),
      1,
      "Rich content was cloned for measurement",
    );
    await page.evaluate(() => {
      document.querySelector("#badge").textContent =
        "A much longer live badge with emphasized words that now wraps over several lines.";
    });
    await page.waitForTimeout(450);
    const expanded = await page.locator(".tg-position").boundingBox();
    assert(
      expanded.width > first.width && expanded.height > first.height,
      "Reactive rich dimensions were not observed",
    );
    assert(
      expanded.x >= 0 &&
        expanded.y >= 0 &&
        expanded.x + expanded.width <= 390 &&
        expanded.y + expanded.height <= 844,
      "Rich tooltip escaped viewport",
    );
    assert.equal(await page.locator("#a").getAttribute("aria-describedby"), description);
    assert(
      !(await page.locator(".tg-skin path").getAttribute("d")).includes("NaN"),
      "Liquid pointer contains invalid geometry",
    );
    await page.evaluate(() => {
      document.querySelector("#badge").textContent = "Pro";
    });
    await page.waitForTimeout(450);
    const shrunk = await page.locator(".tg-position").boundingBox();
    assert(
      shrunk.width < expanded.width && shrunk.height < expanded.height,
      "Rich tooltip did not shrink naturally",
    );
    const frames = await page.evaluate(() => window.frames);
    await page.waitForTimeout(160);
    assert.equal(
      await page.evaluate(() => window.frames),
      frames,
      "Rich content schedules idle work",
    );
    await page.evaluate(() => {
      tips.hide();
      tips.show(a);
    });
    await page.waitForTimeout(240);
    assert.equal(
      await page.evaluate(() => window.mounts),
      1,
      "Interrupted exit remounted rich content",
    );
    await page.evaluate(() => {
      tips.show(b);
      tips.show(a);
      tips.show(b);
      tips.show(a);
    });
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#badge").count(), 1, "Rapid handoffs duplicated rich markup");
    await page.evaluate(() => {
      const badge = document.querySelector("#badge");
      badge.textContent = "Long content. ".repeat(200);
    });
    await page.waitForTimeout(400);
    const scroll = await page.locator(".tg-position .tg-content").evaluate((node) => {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
      node.scrollTop = 80;
      return { top: node.scrollTop, open: node.closest(".tg-position").hasAttribute("data-open") };
    });
    assert(scroll.open && scroll.top > 0, "Long rich content cannot scroll on touch");
    if (engine === chromium) {
      const content = page.locator(".tg-position .tg-content");
      await content.evaluate((node) => {
        node.scrollTop = 0;
      });
      const box = await content.boundingBox();
      const session = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2,
        y = box.y + box.height - 25;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 10; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - step * 10 }],
        });
        await page.waitForTimeout(17);
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(100);
      assert(
        (await content.evaluate((node) => node.scrollTop)) > 10,
        "Inert rich content blocked native touch scrolling",
      );
      await session.detach();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      tips.show(b);
      tips.show(a);
    });
    assert.equal(await page.locator(".tg-position[data-open]").count(), 1);
    await page.evaluate(() => tips.destroy());
    assert.equal(await page.locator(".tg-overlay,.tg-description").count(), 0);
    assert.equal(
      await page.evaluate(() => window.mounts),
      await page.evaluate(() => window.cleanups),
    );
    assert.deepEqual(errors, []);
    console.log(
      `${engine.name()} / rich: live growth/shrink, geometric arrow, interrupted exit, handoffs, touch scrolling, reduced motion and cleanup passed`,
    );
    await page.close();
  } finally {
    await browser.close();
  }
}

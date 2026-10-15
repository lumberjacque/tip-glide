import { afterEach, describe, expect, it, vi } from "vitest";
import { createTipGlide as full } from "../src/index.js";
import { createTipGlide as base } from "../src/base.js";
import { createView } from "../src/view.js";
import { createBaseView } from "../src/base-view.js";
import { resolveOptions } from "../src/options.js";
import { resolveBaseOptions } from "../src/base-options.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function clock() {
  let now = 0,
    sequence = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    pending.delete(id);
  });
  return {
    pending,
    tick(ms: number) {
      now += ms;
      const batch = [...pending.values()];
      pending.clear();
      batch.forEach((callback) => callback(now));
    },
  };
}

describe("bounded animation work", () => {
  it("does not restart travel when remeasuring an unchanged, settled tooltip", () => {
    const time = clock(),
      view = createView(document, window),
      trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 300, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 180, 52));
    const config = resolveOptions({ arrow: true, lean: true });
    view.render(trigger, "Same", config, true, true);
    for (let i = 0; i < 100; i++) view.render(trigger, "Same", config, false, false);
    expect(time.pending.size).toBe(0);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    view.destroy();
  });

  it("does not rewrite SVG dimensions during a glide between equal-size tooltips", () => {
    const time = clock(),
      view = createView(document, window),
      trigger = document.createElement("button");
    const anchor = vi
      .spyOn(trigger, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(300, 300, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 180, 52));
    const config = resolveOptions({ arrow: true, lean: true });
    view.render(trigger, "Same", config, true, true);
    const svg = view.overlay.querySelector("svg")!,
      attributes = vi.spyOn(svg, "setAttribute");
    anchor.mockReturnValue(new DOMRect(600, 300, 40, 40));
    view.render(trigger, "Same", config, false, false);
    for (let i = 0; i < 90; i++) time.tick(1000 / 120);
    expect(attributes.mock.calls.filter(([name]) => name === "viewBox")).toHaveLength(0);
    // Size changes and enabling an old contour after a resize still update its viewport.
    view.render(trigger, "Plain", resolveOptions({}), true, true);
    vi.mocked(view.measurement.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 230, 70));
    view.render(trigger, "Larger", resolveOptions({}), true, true);
    view.render(trigger, "Pointer", config, true, true);
    expect(svg.getAttribute("viewBox")).toBe("-14 -14 258 98");
    view.destroy();
  });

  for (const hz of [60, 120, 144]) {
    it(`retargets the full renderer at ${hz} Hz without layout reads in animation frames or idle work`, () => {
      const time = clock(),
        view = createView(document, window),
        trigger = document.createElement("button");
      const anchor = vi
        .spyOn(trigger, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(300, 300, 40, 40));
      const measure = vi
        .spyOn(view.measurement, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, 180, 52));
      const computed = vi.spyOn(window, "getComputedStyle");
      const width = vi.fn(() => 180),
        height = vi.fn(() => 52);
      Object.defineProperties(view.measurement, {
        offsetWidth: { get: width },
        offsetHeight: { get: height },
      });
      const options = resolveOptions({ arrow: true, lean: true });
      for (let i = 0; i < 120; i++) {
        view.render(trigger, `Tooltip ${i}`, { ...options, placement: i * 3 }, false, true);
        const reads = [anchor, measure, computed, width, height].map(
          (spy) => spy.mock.calls.length,
        );
        expect(time.pending.size).toBeLessThanOrEqual(1);
        time.tick(1000 / hz);
        expect(
          [anchor, measure, computed, width, height].map((spy) => spy.mock.calls.length),
        ).toEqual(reads);
      }
      for (let i = 0; i < hz; i++) time.tick(1000 / hz);
      expect(time.pending.size).toBe(0);
      expect(view.overlay.querySelectorAll("svg")).toHaveLength(1);
      expect(view.overlay.querySelectorAll("path")).toHaveLength(1);
      view.render(trigger, "Interrupt", options, false, true);
      view.destroy();
      expect(time.pending.size).toBe(0);
    });
  }

  it("uses no JavaScript animation frames in the base renderer, including rapid size changes", () => {
    const time = clock(),
      view = createBaseView(document, window),
      trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 300, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 180, 52));
    for (let i = 0; i < 300; i++)
      view.render(trigger, `Tooltip ${i}`, resolveBaseOptions({}), false);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(view.overlay.querySelector("svg")).toBeNull();
    expect(view.overlay.children).toHaveLength(2);
    view.destroy();
    expect(time.pending.size).toBe(0);
  });
});

describe.each([
  ["full", full],
  ["base", base],
] as const)("%s lifecycle scaling", (_name, create) => {
  it("keeps delegated listener counts constant for 1 versus 1,000 triggers", () => {
    const docListen = vi.spyOn(document, "addEventListener"),
      winListen = vi.spyOn(window, "addEventListener");
    const counts = [];
    for (const count of [1, 1000]) {
      const root = document.createElement("div");
      for (let i = 0; i < count; i++) {
        const button = document.createElement("button");
        button.dataset.tip = `Description ${i}`;
        root.append(button);
      }
      document.body.append(root);
      docListen.mockClear();
      winListen.mockClear();
      const tips = create(root);
      counts.push([docListen.mock.calls.length, winListen.mock.calls.length]);
      expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
      expect(document.querySelectorAll(".tg-description")).toHaveLength(count);
      tips.destroy();
      root.remove();
      expect(document.querySelectorAll(".tg-overlay, .tg-description")).toHaveLength(0);
    }
    expect(counts[1]).toEqual(counts[0]);
  });

  it("coalesces a scroll/resize storm into one frame and cancels it on destruction", () => {
    const time = clock(),
      tips = create(document);
    for (let i = 0; i < 100; i++) {
      document.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    }
    expect(time.pending.size).toBe(1);
    time.tick(1000 / 120);
    expect(time.pending.size).toBe(0);
    document.dispatchEvent(new Event("scroll"));
    tips.destroy();
    expect(time.pending.size).toBe(0);
  });
});

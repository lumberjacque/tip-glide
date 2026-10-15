import { afterEach, describe, expect, it, vi } from "vitest";
import { createView } from "../src/view.js";
import { resolveOptions } from "../src/options.js";
import * as contours from "../src/skin.js";
import * as geometry from "../src/geometry.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("interrupted motion", () => {
  it("does not read animated styles for instant or disabled exits", () => {
    const computed = vi.spyOn(window, "getComputedStyle"),
      view = createView(document, window),
      trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    view.render(trigger, "Instant", resolveOptions({}), true, true);
    view.hide(true);
    expect(computed).not.toHaveBeenCalled();
    view.render(trigger, "None", resolveOptions({ enter: "none", exit: "none" }), false, true);
    view.hide(false);
    expect(computed).not.toHaveBeenCalled();
    view.destroy();
  });
  it("defers viewport/layout measurement until presentation", () => {
    const bounds = vi.spyOn(geometry, "getBoundary");
    const view = createView(document, window);
    expect(bounds).not.toHaveBeenCalled();
    view.destroy();
  });
  it("does no SVG contour work until arrows are enabled, then reuses the contour", () => {
    const draw = vi.spyOn(contours, "skin");
    const computed = vi.spyOn(window, "getComputedStyle");
    const view = createView(document, window);
    const trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    view.render(trigger, "Plain", resolveOptions({}), true, true);
    expect(computed).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
    expect(view.overlay.querySelector("svg")).toBeNull();
    view.render(trigger, "Pointer", resolveOptions({ arrow: true }), true, true);
    expect(computed).toHaveBeenCalledTimes(1);
    const svg = view.overlay.querySelector<SVGSVGElement>("svg")!;
    expect(draw).toHaveBeenCalledTimes(1);
    view.render(trigger, "Plain again", resolveOptions({}), true, true);
    expect(computed).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(svg.style.display).toBe("none");
    view.render(trigger, "Pointer again", resolveOptions({ arrow: true }), true, true);
    expect(view.overlay.querySelector("svg")).toBe(svg);
    expect(svg.style.display).toBe("");
    view.destroy();
  });

  it("finishes measuring before writing animated geometry", () => {
    const view = createView(document, window);
    const trigger = document.createElement("button");
    const order: string[] = [];
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    Object.defineProperty(view.measurement, "offsetWidth", {
      get() {
        order.push("read");
        return 100;
      },
    });
    Object.defineProperty(view.measurement, "offsetHeight", {
      get() {
        order.push("read");
        return 40;
      },
    });
    const style = view.position.style;
    Object.defineProperty(view.position, "style", {
      value: new Proxy(style, {
        set(target, property, value) {
          if (property === "width") order.push("write");
          return Reflect.set(target, property, value);
        },
      }),
    });
    expect(view.render(trigger, "Measured", resolveOptions({}), true, true)).toBe(
      "100,100,40,40,100,40",
    );
    expect(order).toEqual(["read", "read", "write"]);
    view.destroy();
  });
  it("fades the whole surface evenly without changing its transform, and skips effects for instant presentation", () => {
    const view = createView(document, window);
    const trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    const motion = view.overlay.querySelector<HTMLElement>(".tg-motion")!;
    const animation = { finished: new Promise(() => {}), cancel: vi.fn() };
    const animate = vi.fn<
      (frames: Keyframe[], timing: KeyframeAnimationOptions) => typeof animation
    >(() => animation);
    Object.defineProperty(motion, "animate", { value: animate });
    Object.defineProperty(motion, "getAnimations", { value: () => [animation] });
    const options = resolveOptions({ enter: "fade", exit: "fade" });
    view.render(trigger, "Preview", options, false, true);
    expect(animate.mock.calls[0]).toEqual([
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, easing: "linear" },
    ]);
    view.hide(false);
    expect(animate.mock.calls[1]?.[1]).toMatchObject({ duration: 140, easing: "linear" });
    expect(animate.mock.calls[1]?.[0]).toMatchObject([
      { opacity: expect.anything() },
      { opacity: 0 },
    ]);
    view.render(trigger, "Preview", options, true, true);
    view.hide(true);
    expect(animate).toHaveBeenCalledTimes(2);
    view.destroy();
  });
  it("keeps one positive-size background and clip throughout rapid retargets, and settles without an idle loop", () => {
    let now = 0,
      id = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window.performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.set(++id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => {
      callbacks.delete(frame);
    });
    const tick = (elapsed: number) => {
      now += elapsed;
      const queue = [...callbacks.values()];
      callbacks.clear();
      queue.forEach((callback) => callback(now));
    };
    const view = createView(document, window);
    const trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 300, 40, 40));
    const dimensions = () =>
      view.measurement.textContent === "Short" ? [79.25, 35.2] : [255, 53.2];
    vi.spyOn(view.measurement, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, ...(dimensions() as [number, number])),
    );
    const options = resolveOptions({ enter: "none", lean: true, arrow: true });
    view.render(trigger, "Short", options, false, true);
    expect(view.position.style.width).toBe("80px");
    expect(view.position.style.height).toBe("36px");
    const background = view.overlay.querySelector(".tg-backdrop");
    const clip = view.overlay.querySelector(".tg-clip");
    for (let i = 0; i < 12; i++) {
      view.render(trigger, i % 2 ? "Short" : "Long", options, false, true);
      tick(35);
      expect(view.overlay.querySelector(".tg-backdrop")).toBe(background);
      expect(view.overlay.querySelector(".tg-clip")).toBe(clip);
      expect(parseFloat(view.position.style.width)).toBeGreaterThan(0);
      expect(parseFloat(view.position.style.height)).toBeGreaterThan(0);
      expect(view.overlay.querySelector("path")?.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    }
    view.render(trigger, "Long", options, false, true);
    for (let i = 0; i < 35; i++) tick(16);
    expect(view.position.style.width).toBe("255px");
    expect(view.position.style.height).toBe("54px");
    expect(callbacks.size).toBe(0);
    expect(
      view.overlay.querySelector<HTMLElement>(".tg-content:not(.tg-measure)")?.style.opacity,
    ).toBe("1");
    view.destroy();
  });

  it("keeps custom entry/exit alive through ordinary repositioning, but cancels them for instant focus", () => {
    const view = createView(document, window),
      trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    const motion = view.overlay.querySelector<HTMLElement>(".tg-motion")!;
    const enter = {
      keyframes: [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      duration: 160,
    };
    const exit = { keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 70 };
    for (const effect of [enter, exit]) {
      effect.keyframes.forEach((keyframe) => Object.freeze(keyframe));
      Object.freeze(effect.keyframes);
    }
    const options = resolveOptions({ enter, exit });
    const cancellation = vi.fn();
    const animation = { finished: new Promise(() => {}), cancel: cancellation };
    const animate = vi.fn<
      (frames: Keyframe[], timing: KeyframeAnimationOptions) => typeof animation
    >(() => animation);
    Object.defineProperty(motion, "animate", { value: animate });
    Object.defineProperty(motion, "getAnimations", { value: () => [animation] });
    view.render(trigger, "A", options, false, true);
    expect(animate.mock.calls[0]?.[0]).toEqual(enter.keyframes);
    const count = cancellation.mock.calls.length;
    view.render(trigger, "A", options, false, false);
    expect(cancellation).toHaveBeenCalledTimes(count);
    view.hide(false);
    expect(animate.mock.calls[1]?.[1]).toMatchObject({ duration: 70 });
    view.render(trigger, "B", options, true, true);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancellation.mock.calls.length).toBeGreaterThan(count);
    view.destroy();
  });

  it("uses fractional measurement without wrapping into an unmeasured extra line", () => {
    const view = createView(document, window),
      trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 40, 40));
    vi.spyOn(view.measurement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 241.4, 35.6),
    );
    Object.defineProperty(view.measurement, "offsetWidth", { value: 241 });
    view.render(trigger, "Drag me near an edge. I will find room.", resolveOptions({}), true, true);
    expect(
      view.overlay.querySelector<HTMLElement>(".tg-content:not(.tg-measure)")?.style.width,
    ).toBe("242px");
    expect(view.position.style.height).toBe("36px");
    view.destroy();
  });
});

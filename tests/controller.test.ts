import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTipGlide } from "../src/index.js";
import type { TipGlide } from "../src/index.js";

let groups: TipGlide[];
let root: HTMLElement;
let a: HTMLButtonElement;
let b: HTMLButtonElement;
let media: Map<string, MediaQueryList>;

function group(options: Parameters<typeof createTipGlide>[1] = {}) {
  const result = createTipGlide(root, options);
  groups.push(result);
  return result;
}

function hover(trigger: HTMLElement) {
  trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
}

function leave(trigger: HTMLElement) {
  trigger.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
}

function visible() {
  return document.querySelectorAll(".tg-position[data-open]");
}

beforeEach(() => {
  vi.useFakeTimers();
  groups = [];
  media = new Map();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    if (!media.has(query)) {
      const target = new EventTarget();
      Object.assign(target, { matches: query.includes("hover"), media: query, onchange: null });
      media.set(query, target as MediaQueryList);
    }
    return media.get(query)!;
  });
  root = document.createElement("div");
  a = document.createElement("button");
  b = document.createElement("button");
  a.dataset.tip = "First description";
  b.dataset.tip = "Second description";
  root.append(a, b);
  document.body.append(root);
  // DOM simulators have no layout; provide measurable, visible trigger rectangles.
  for (const [index, trigger] of [a, b].entries()) {
    const rect = new DOMRect(100 + index * 100, 200, 60, 40);
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect);
    vi.spyOn(trigger, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
  }
});

afterEach(() => {
  groups.forEach((controller) => controller.destroy());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("group lifecycle and descriptions", () => {
  it("keeps its own scroll surface open when touched, but dismisses on outside touch", () => {
    const tips = group({ enter: "none", exit: "none" });
    tips.add(a, "A long description. ".repeat(100));
    tips.show(a);
    const content = document.querySelector<HTMLElement>(".tg-content")!;
    content.scrollTop = 40;
    content.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(visible()).toHaveLength(1);
    expect(content.scrollTop).toBe(40);
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );
    expect(visible()).toHaveLength(0);
  });
  it("preserves existing descriptions and keeps one stable description per trigger", () => {
    a.setAttribute("aria-describedby", "existing");
    group();
    expect(a.getAttribute("aria-describedby")).toMatch(/^existing tip-glide-/);
    const aId = a.getAttribute("aria-describedby")!.split(" ")[1]!;
    const bId = b.getAttribute("aria-describedby")!;
    expect(aId).not.toBe(bId);
    expect(document.getElementById(aId)?.textContent).toBe("First description");
    expect(document.getElementById(bId)?.textContent).toBe("Second description");
  });
  it("never interprets content as HTML", () => {
    const tips = group();
    tips.add(a, "<img src=x onerror=alert(1)>");
    tips.show(a);
    expect(document.querySelector(".tg-content")?.textContent).toContain("<img");
    expect(document.querySelector(".tg-overlay img")).toBeNull();
  });
  it("allows later registrations and makes stale cleanup functions harmless", () => {
    const tips = group();
    const oldCleanup = tips.add(a, "Old");
    const cleanup = tips.add(a, "New");
    oldCleanup();
    tips.show(a);
    expect(visible()).toHaveLength(1);
    expect(document.querySelector(".tg-content")?.textContent).toBe("New");
    cleanup();
    cleanup();
    expect(visible()).toHaveLength(0);
  });
  it("removes only its own aria token, including changes made by the application", () => {
    const tips = group();
    a.setAttribute("aria-describedby", `${a.getAttribute("aria-describedby")} app-added`);
    tips.destroy();
    tips.destroy();
    expect(a.getAttribute("aria-describedby")).toBe("app-added");
    expect(document.querySelector(".tg-overlay")).toBeNull();
    expect(document.querySelector(".tg-description")).toBeNull();
  });
  it("rejects foreign documents and tolerates calls after destroy", () => {
    const tips = group();
    const foreign = document.implementation.createHTMLDocument().createElement("button");
    expect(() => tips.add(foreign, "Text")).toThrow(TypeError);
    tips.destroy();
    expect(() => {
      tips.show(a);
      tips.update({ lean: false });
      tips.add(a);
      tips.reposition();
    }).not.toThrow();
  });
  it("keeps different groups independent", () => {
    const first = group();
    const second = group();
    first.show(a);
    second.show(b);
    expect(visible()).toHaveLength(2);
    first.destroy();
    expect(visible()).toHaveLength(1);
    expect(a.getAttribute("aria-describedby")).toMatch(/^tip-glide-/);
  });
});

describe("timing and interruption", () => {
  it("delays the first hover and shows the optional fuse", () => {
    group({ showFuse: true });
    hover(a);
    expect(visible()).toHaveLength(0);
    expect(document.querySelector<HTMLElement>(".tg-fuse")?.hidden).toBe(false);
    vi.advanceTimersByTime(400);
    expect(visible()).toHaveLength(1);
    expect(document.querySelector<HTMLElement>(".tg-fuse")?.hidden).toBe(true);
  });
  it("cancels an accidental hover and resets its opening delay", () => {
    group();
    hover(a);
    vi.advanceTimersByTime(200);
    leave(a);
    vi.advanceTimersByTime(1000);
    expect(visible()).toHaveLength(0);
    hover(b);
    vi.advanceTimersByTime(399);
    expect(visible()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(visible()).toHaveLength(1);
  });
  it("hands off without another opening delay and keeps one surface", () => {
    group();
    hover(a);
    vi.advanceTimersByTime(400);
    leave(a);
    hover(b);
    expect(visible()).toHaveLength(1);
    expect(document.querySelector(".tg-content")?.textContent).toBe("Second description");
    vi.advanceTimersByTime(120);
    expect(visible()).toHaveLength(1);
  });
  it("stays warm briefly after a close then restores the delay", () => {
    group({ motion: "reduced" });
    hover(a);
    vi.advanceTimersByTime(400);
    leave(a);
    vi.advanceTimersByTime(120);
    hover(b);
    expect(visible()).toHaveLength(1);
    leave(b);
    vi.advanceTimersByTime(800);
    hover(a);
    expect(visible()).toHaveLength(0);
    vi.advanceTimersByTime(400);
    expect(visible()).toHaveLength(1);
  });
  it("dismisses pending and visible tooltips on Escape without re-opening on timers", () => {
    group();
    hover(a);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    vi.advanceTimersByTime(800);
    expect(visible()).toHaveLength(0);
    a.focus();
    expect(visible()).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    vi.advanceTimersByTime(800);
    expect(visible()).toHaveLength(0);
  });
  it("does not keep pending work after destroy", () => {
    const tips = group();
    hover(a);
    tips.destroy();
    vi.advanceTimersByTime(1000);
    hover(b);
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
});

describe("input and layout", () => {
  it("dismisses an anchor that leaves the visible viewport", () => {
    const tips = group();
    tips.show(a);
    vi.mocked(a.getBoundingClientRect).mockReturnValue(new DOMRect(-500, 200, 60, 40));
    tips.reposition();
    expect(visible()).toHaveLength(0);
  });
  it("rejects foreign boundaries without changing the active group", () => {
    const tips = group();
    tips.show(a);
    const boundary = document.implementation.createHTMLDocument().createElement("div");
    expect(() => tips.update({ boundary })).toThrow(TypeError);
    expect(visible()).toHaveLength(1);
    expect(() => createTipGlide(root, { boundary })).toThrow(TypeError);
  });
  it("puts the fuse above a trigger for a top placement", () => {
    group({ showFuse: true, placement: "top" });
    hover(a);
    const fuse = document.querySelector<HTMLElement>(".tg-fuse")!;
    expect(fuse.style.transform).toBe("translate(100px, 195px)");
    expect(fuse.style.height).toBe("2px");
  });
  it("exposes an optional arrow without changing accessible descriptions", () => {
    const tips = group({ arrow: true });
    vi.spyOn(
      document.querySelector<HTMLElement>(".tg-measure")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 100, 40));
    tips.show(a);
    expect(document.querySelector(".tg-skin path")?.getAttribute("d")).toContain("Q");
    tips.update({ arrow: false });
    expect(document.querySelector<SVGElement>(".tg-skin")?.style.display).toBe("none");
    expect(document.getElementById(a.getAttribute("aria-describedby")!)?.hidden).toBe(true);
  });
  it("opens immediately on focus without moving focus", () => {
    group();
    a.focus();
    expect(visible()).toHaveLength(1);
    expect(document.activeElement).toBe(a);
    expect(document.querySelector<HTMLElement>(".tg-position")?.style.transition).toBe("none");
    b.focus();
    expect(document.querySelector(".tg-content")?.textContent).toBe("Second description");
    b.blur();
    expect(visible()).toHaveLength(0);
  });
  it("does not treat touch pointer events as hover", () => {
    group();
    a.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    vi.advanceTimersByTime(1000);
    expect(visible()).toHaveLength(0);
  });
  it("keeps the tooltip open when the pointer reaches it", () => {
    group({ motion: "reduced" });
    a.focus();
    a.blur();
    hover(a);
    leave(a);
    document.querySelector(".tg-position")?.dispatchEvent(new PointerEvent("pointerenter"));
    vi.advanceTimersByTime(1000);
    expect(visible()).toHaveLength(1);
  });
  it("reacts to live reduced-motion changes", () => {
    const tips = group();
    vi.spyOn(
      document.querySelector<HTMLElement>(".tg-measure")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 100, 40));
    const request = vi.spyOn(window, "requestAnimationFrame");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    tips.show(a);
    tips.show(b);
    expect(request).toHaveBeenCalled();
    const query = media.get("(prefers-reduced-motion: reduce)")!;
    Object.assign(query, { matches: true });
    query.dispatchEvent(new Event("change"));
    expect(cancel).toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>(".tg-position")?.style.transition).toBe("none");
  });
  it("cancels a stale fuse on scroll", () => {
    group({ showFuse: true });
    hover(a);
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(800);
    expect(visible()).toHaveLength(0);
    expect(document.querySelector<HTMLElement>(".tg-fuse")?.hidden).toBe(true);
  });
  it("dismisses removed active triggers and releases their descriptions", async () => {
    const tips = group();
    tips.show(a);
    a.remove();
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        observer.disconnect();
        resolve();
      });
      observer.observe(root, { childList: true });
      root.append(document.createElement("span"));
    });
    expect(visible()).toHaveLength(0);
    expect(a.hasAttribute("aria-describedby")).toBe(false);
  });
  it("leaves the active tooltip intact if an update is invalid", () => {
    const tips = group();
    tips.show(a);
    expect(() => tips.update({ duration: -1 })).toThrow();
    expect(visible()).toHaveLength(1);
  });
});

describe("custom animation validation", () => {
  it("rejects invalid browser keyframes before creating DOM or replacing active settings", () => {
    vi.stubGlobal(
      "KeyframeEffect",
      function (_target: unknown, _frames: unknown, options: { easing: string }) {
        if (options.easing === "invalid") throw new TypeError("Invalid easing");
      },
    );
    try {
      const enter = { keyframes: [{ opacity: 0 }, { opacity: 1 }], easing: "invalid" };
      expect(() => group({ enter })).toThrow("Invalid easing");
      expect(document.querySelector(".tg-overlay")).toBeNull();
      const tips = group();
      tips.show(a);
      expect(() => tips.update({ enter, className: "must-not-apply" })).toThrow("Invalid easing");
      expect(visible()).toHaveLength(1);
      expect(document.querySelector(".must-not-apply")).toBeNull();
      tips.show(b);
      expect(document.querySelector(".tg-content")?.textContent).toBe("Second description");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("document mutation cost", () => {
  it("does not rescan registered triggers for text updates or added elements", async () => {
    group();
    const connected = vi.spyOn(a, "isConnected", "get").mockReturnValue(true);
    const text = document.createElement("p");
    text.textContent = "Before";
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        observer.disconnect();
        resolve();
      });
      observer.observe(root, { childList: true, subtree: true });
      root.append(text);
      text.textContent = "After";
    });
    expect(connected).not.toHaveBeenCalled();
  });
});

function pointer(target: HTMLElement, type: string, x = 0, kind = "touch") {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerType: kind,
      pointerId: 1,
      button: 0,
      clientX: x,
    }),
  );
}
function tap(target: HTMLElement) {
  pointer(target, "pointerdown");
  pointer(target, "pointerup");
  target.click();
}
describe("touch and drag policy", () => {
  it("keeps touch scroll open when the browser sends pointerleave after claiming the gesture", () => {
    group({ touch: "tap" });
    tap(a);
    document
      .querySelector(".tg-position")!
      .dispatchEvent(new PointerEvent("pointerleave", { pointerType: "touch" }));
    vi.advanceTimersByTime(1000);
    expect(visible()).toHaveLength(1);
  });

  it("opts into tap toggling without cancelling the trigger action", () => {
    group({ touch: "tap" });
    const action = vi.fn();
    a.addEventListener("click", action);
    tap(a);
    expect(visible()).toHaveLength(1);
    expect(action).toHaveBeenCalledTimes(1);
    tap(a);
    expect(visible()).toHaveLength(0);
    tap(b);
    expect(visible()).toHaveLength(1);
    pointer(document.body, "pointerdown");
    expect(visible()).toHaveLength(0);
  });
  it("does not enable tap by default or open after touch dragging/cancellation", () => {
    const tips = group();
    tap(a);
    expect(visible()).toHaveLength(0);
    tips.update({ touch: "tap" });
    pointer(a, "pointerdown");
    pointer(a, "pointermove", 10);
    pointer(a, "pointerup", 10);
    a.click();
    expect(visible()).toHaveLength(0);
    pointer(a, "pointerdown");
    pointer(a, "pointercancel");
    a.click();
    expect(visible()).toHaveLength(0);
  });
  it("dismisses after the drag threshold and suppresses hover/focus during the drag", () => {
    const tips = group();
    tips.show(a);
    pointer(a, "pointerdown", 0, "mouse");
    pointer(a, "pointermove", 5, "mouse");
    expect(visible()).toHaveLength(1);
    pointer(a, "pointermove", 7, "mouse");
    expect(visible()).toHaveLength(0);
    hover(b);
    b.focus();
    expect(visible()).toHaveLength(0);
    pointer(a, "pointerup", 7, "mouse");
    a.click();
    hover(b);
    vi.advanceTimersByTime(500);
    expect(visible()).toHaveLength(1);
  });
  it("retains geometry during deliberate positioning demos", () => {
    const tips = group({ hideOnDrag: false });
    tips.show(a);
    pointer(a, "pointerdown", 0, "mouse");
    pointer(a, "pointermove", 100, "mouse");
    expect(visible()).toHaveLength(1);
    a.dispatchEvent(new Event("dragstart", { bubbles: true }));
    expect(visible()).toHaveLength(1);
    tips.update({ hideOnDrag: true });
    a.dispatchEvent(new Event("dragstart", { bubbles: true }));
    expect(visible()).toHaveLength(0);
  });
});

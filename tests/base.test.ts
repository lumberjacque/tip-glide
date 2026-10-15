import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTipGlide, type TipGlideBase } from "../src/base.js";

let tips: TipGlideBase | undefined, trigger: HTMLButtonElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      Object.assign(new EventTarget(), {
        matches: query.includes("hover"),
        media: query,
      }) as MediaQueryList,
  );
  trigger = document.createElement("button");
  trigger.dataset.tip = "Plain description";
  document.body.append(trigger);
  const rect = new DOMRect(100, 100, 40, 40);
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(trigger, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
});
afterEach(() => {
  tips?.destroy();
  tips = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps stable accessible descriptions and opens immediately for keyboard focus", () => {
  trigger.setAttribute("aria-describedby", "existing");
  tips = createTipGlide(document);
  const ids = trigger.getAttribute("aria-describedby")!;
  trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(document.querySelector(".tg-position[data-open]")).not.toBeNull();
  expect(document.querySelector<HTMLElement>(".tg-position")?.style.transition).toBe("none");
  expect(trigger.getAttribute("aria-describedby")).toBe(ids);
  trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  expect(document.querySelector(".tg-position[data-open]")).toBeNull();
  tips.destroy();
  expect(trigger.getAttribute("aria-describedby")).toBe("existing");
});

it("honors hover delays and ignores touch hover", () => {
  tips = createTipGlide(document, { openDelay: 100 });
  trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
  vi.advanceTimersByTime(200);
  expect(document.querySelector(".tg-position[data-open]")).toBeNull();
  trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  vi.advanceTimersByTime(99);
  expect(document.querySelector(".tg-position[data-open]")).toBeNull();
  vi.advanceTimersByTime(1);
  expect(document.querySelector(".tg-position[data-open]")).not.toBeNull();
});

it("rejects invalid updates atomically and preserves reduced motion after valid updates", () => {
  tips = createTipGlide(document, { motion: "reduced" });
  tips.update({ className: "before-open" });
  expect(document.querySelector(".tg-base.before-open")).not.toBeNull();
  tips.show(trigger);
  expect(() => tips!.update({ duration: -1 })).toThrow(RangeError);
  tips.update({ className: "custom", placement: "right" });
  expect(document.querySelector(".tg-overlay")?.classList.contains("tg-base")).toBe(true);
  expect(document.querySelector(".tg-overlay")?.classList.contains("custom")).toBe(true);
  expect(document.querySelector<HTMLElement>(".tg-position")?.style.transition).toBe("none");
});

it("flips a top tooltip at the viewport edge and contains long text", () => {
  tips = createTipGlide(document);
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 5, 40, 40));
  const measurement = document.querySelector<HTMLElement>(".tg-measure")!;
  vi.spyOn(measurement, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 180, 60));
  tips.show(trigger);
  expect(document.querySelector<HTMLElement>(".tg-position")?.dataset.placement).toBe("bottom");
  expect(document.querySelector<HTMLElement>(".tg-content")?.style.maxWidth).toContain("min(");
  tips.add(trigger, "<b>Long plain text</b>");
  tips.show(trigger);
  expect(document.querySelector(".tg-content b")).toBeNull();
});

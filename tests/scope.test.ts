import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTipGlideScope } from "../src/scope.js";
const scopes: ReturnType<typeof createTipGlideScope>[] = [];
const scope = (options = {}) => {
  const next = createTipGlideScope(options);
  scopes.push(next);
  return next;
};
function button() {
  const node = document.createElement("button");
  document.body.append(node);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 200, 40, 40));
  vi.spyOn(node, "getClientRects").mockReturnValue([
    new DOMRect(100, 200, 40, 40),
  ] as unknown as DOMRectList);
  return node;
}
const hover = (node: HTMLElement) =>
  node.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
const leave = (node: HTMLElement) => {
  node.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
  vi.advanceTimersByTime(0);
};

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      Object.assign(new EventTarget(), {
        matches: query.includes("reduced"),
        media: query,
        onchange: null,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  scopes.splice(0).forEach((s) => s.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("allocates lazily and shares one surface between separate component triggers", () => {
  const app = scope({ className: "app-config", warmDuration: 900 });
  const a = app.attach(button(), null);
  expect(document.querySelector(".tg-overlay")).toBeNull();
  a.update("One");
  const b = app.attach(button(), "Two");
  document.querySelector<HTMLButtonElement>("button")!.focus();
  expect(document.querySelectorAll(".tg-overlay.app-config")).toHaveLength(1);
  expect(document.querySelectorAll(".tg-description")).toHaveLength(2);
  a.destroy();
  expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
  b.destroy();
  expect(document.querySelector(".tg-overlay")).toBeNull();
});
it("updates visible text in place and preserves the accessible description token", () => {
  const app = scope(),
    element = button(),
    binding = app.attach(element, "One");
  const token = element.getAttribute("aria-describedby");
  element.focus();
  expect(document.querySelector(".tg-position[data-open]")).not.toBeNull();
  binding.update("A different description");
  expect(element.getAttribute("aria-describedby")).toBe(token);
  expect(document.querySelector(".tg-position[data-open] .tg-content")?.textContent).toBe(
    "A different description",
  );
  binding.update(false);
  expect(document.querySelector(".tg-overlay")).toBeNull();
  binding.update("Enabled again");
  expect(document.querySelectorAll(".tg-description")).toHaveLength(1);
});
it("updates global configuration, resets omitted fields and rejects invalid replacements", () => {
  const app = scope({ className: "one" });
  const element = button();
  app.attach(element, "Text");
  element.focus();
  expect(() => app.configure({ duration: -1 })).toThrow();
  expect(document.querySelector(".one")).not.toBeNull();
  app.configure({ className: "two" });
  expect(document.querySelector(".two")).not.toBeNull();
  app.configure();
  expect(document.querySelector(".two")).toBeNull();
});
it("isolates applications and makes old cleanup harmless across scope restarts", () => {
  const first = scope({ className: "first" }),
    second = scope({ className: "second" });
  const old = first.attach(button(), "First");
  second.attach(button(), "Second");
  first.destroy();
  const fresh = first.attach(button(), "Fresh");
  old.destroy();
  expect(document.querySelectorAll(".tg-overlay")).toHaveLength(2);
  fresh.destroy();
  expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
});
it("rejects non-text content without allocating a group", () => {
  const app = scope();
  expect(() => app.attach(button(), 42 as never)).toThrow(TypeError);
  expect(document.querySelector(".tg-overlay")).toBeNull();
});

it("keeps the configured warm window between triggers from separate components", () => {
  vi.useFakeTimers();
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      Object.assign(new EventTarget(), {
        matches: query.includes("hover"),
        media: query,
        onchange: null,
      }) as MediaQueryList,
  );
  const app = scope({ openDelay: 1000, closeDelay: 0, warmDuration: 800, motion: "reduced" });
  const a = button(),
    b = button();
  app.attach(a, "First");
  app.attach(b, "Second");
  hover(a);
  vi.advanceTimersByTime(999);
  expect(document.querySelector(".tg-position[data-open]")).toBeNull();
  vi.advanceTimersByTime(1);
  expect(document.querySelector(".tg-position[data-open]")).not.toBeNull();
  leave(a);
  hover(b);
  expect(document.querySelector(".tg-position[data-open] .tg-content")?.textContent).toBe("Second");
  leave(b);
  vi.advanceTimersByTime(801);
  hover(a);
  expect(document.querySelector(".tg-position[data-open]")).toBeNull();
});

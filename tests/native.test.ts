import { afterEach, expect, it, vi } from "vitest";
import { createNativeView } from "../src/native-view.js";
import { resolveBaseOptions } from "../src/base-options.js";
import { createOverlay } from "../src/overlay.js";
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("restores anchor styles even when two native groups share a trigger", () => {
  const a = document.createElement("button"),
    b = document.createElement("button");
  document.body.append(a, b);
  a.style.setProperty("anchor-name", "--app");
  const first = createNativeView(document, window),
    second = createNativeView(document, window);
  const config = resolveBaseOptions({});
  const read = vi.spyOn(a, "getBoundingClientRect");
  const frame = vi.spyOn(window, "requestAnimationFrame");
  first.render(a, "One", config, false);
  second.render(a, "Two", config, false);
  expect(a.style.getPropertyValue("anchor-name").split(",")).toHaveLength(3);
  first.render(b, "Moved", config, false);
  expect(a.style.getPropertyValue("anchor-name").split(",")).toHaveLength(2);
  second.destroy();
  first.destroy();
  expect(a.style.getPropertyValue("anchor-name")).toBe("--app");
  expect(a.style.getPropertyPriority("anchor-name")).toBe("");
  expect(b.style.getPropertyValue("anchor-name")).toBe("");
  expect(read).not.toHaveBeenCalled();
  expect(frame).not.toHaveBeenCalled();
});
it("falls back to a body host when popovers are unavailable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover")!;
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    value: undefined,
    configurable: true,
  });
  const host = createOverlay(document, "tg-overlay");
  try {
    host.present();
    expect(host.element.parentElement).toBe(document.body);
    host.conceal();
    host.destroy();
    expect(host.element.isConnected).toBe(false);
  } finally {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, "showPopover", descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  }
});

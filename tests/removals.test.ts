import { afterEach, expect, it, vi } from "vitest";
import { trackRemoval } from "../src/removals.js";
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
it("shares one observer per document, including independent groups on one trigger", async () => {
  const NativeObserver = window.MutationObserver;
  const observer = vi.fn(function (callback: MutationCallback) {
    return new NativeObserver(callback);
  });
  vi.spyOn(window, "MutationObserver").mockImplementation(observer);
  const parent = document.createElement("div"),
    a = document.createElement("button");
  parent.append(a);
  document.body.append(parent);
  const first = vi.fn(),
    second = vi.fn();
  const off1 = trackRemoval(a, first),
    off2 = trackRemoval(a, second);
  expect(observer).toHaveBeenCalledTimes(1);
  parent.remove();
  await flush();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  off1();
  off1();
  off2();
});
it("ignores connected moves and unrelated removals", async () => {
  const a = document.createElement("button"),
    other = document.createElement("div");
  document.body.append(a, other);
  const cleanup = vi.fn(),
    off = trackRemoval(a, cleanup);
  other.append(a);
  other.removeChild(a);
  document.body.append(a);
  await flush();
  other.remove();
  await flush();
  expect(cleanup).not.toHaveBeenCalled();
  off();
  a.remove();
  await flush();
  expect(cleanup).not.toHaveBeenCalled();
});

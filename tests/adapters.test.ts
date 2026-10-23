import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h, nextTick, ref, withDirectives } from "vue";
import { TipGlide, TipGlideProvider, useTooltip } from "../src/react.js";
import { vTipGlide, createTipGlidePlugin } from "../src/vue.js";
import { tipGlide } from "../src/svelte.js";
import { bindTipGlide } from "../src/adapters/binding.js";

const disposals: (() => void | Promise<void>)[] = [];
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const descriptions = () => Array.from(document.querySelectorAll<HTMLElement>(".tg-description"));
const host = () => {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
};
const render = (text: string, key = "a", className = "one") =>
  createElement(
    StrictMode,
    null,
    createElement(
      TipGlide,
      { key, options: { className } },
      createElement("button", { "data-tip": text }, "Save"),
    ),
  );

function ReactTextTrigger({ text }: { text: string }) {
  const tipRef = useTooltip<HTMLButtonElement>(text);
  return createElement("button", { ref: tipRef }, "Save");
}

const reactApp = (text: string) =>
  createElement(
    StrictMode,
    null,
    createElement(
      TipGlideProvider,
      { options: { className: "central" } },
      createElement(ReactTextTrigger, { text }),
      createElement(ReactTextTrigger, { text: "Other" }),
    ),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      Object.assign(new EventTarget(), {
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
      }) as MediaQueryList,
  );
});
afterEach(async () => {
  while (disposals.length) await disposals.pop()!();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("framework DOM ownership", () => {
  it("reconciles conditional triggers and changed text without losing unrelated descriptions", async () => {
    const root = host();
    root.innerHTML = '<button data-tip="First" aria-describedby="existing">Save</button>';
    const binding = bindTipGlide(root);
    disposals.push(binding.destroy);
    const first = root.firstElementChild!;
    const id = first.getAttribute("aria-describedby")!;
    root.append(document.createElement("hr"));
    await flush();
    expect(first.getAttribute("aria-describedby")).toBe(id);
    first.setAttribute("data-tip", "Updated");
    const second = document.createElement("button");
    second.dataset.tip = "Second";
    root.append(second);
    await flush();
    expect(descriptions().map((node) => node.textContent)).toEqual(["Updated", "Second"]);
    expect(first.getAttribute("aria-describedby")).toContain("existing");
    first.removeAttribute("data-tip");
    second.remove();
    await flush();
    expect(descriptions()).toHaveLength(0);
    expect(first.getAttribute("aria-describedby")).toBe("existing");
    binding.destroy();
    binding.destroy();
    second.dataset.tip = "After cleanup";
    root.append(second);
    await flush();
    expect(descriptions()).toHaveLength(0);
  });

  it("does not leave a delayed tooltip behind after destroying its owner", async () => {
    const root = host();
    root.innerHTML = '<button data-tip="Pending">Save</button>';
    const binding = bindTipGlide(root, { openDelay: 10 });
    root.firstElementChild!.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
    );
    binding.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelector(".tg-overlay")).toBeNull();
    expect(root.firstElementChild!.hasAttribute("aria-describedby")).toBe(false);
  });

  it("resets omitted options and rejects invalid updates without corrupting an existing group", () => {
    const root = host();
    root.innerHTML = '<button data-tip="Text">Save</button>';
    const binding = bindTipGlide(root, { className: "original", boundary: "root" });
    disposals.push(binding.destroy);
    binding.update({ className: "changed" });
    expect(document.querySelector(".tg-overlay")!.classList.contains("changed")).toBe(true);
    expect(() => binding.update({ gap: -1 })).toThrow();
    expect(descriptions()).toHaveLength(1);
    binding.update();
    expect(document.querySelector(".tg-overlay")!.classList.contains("changed")).toBe(false);
  });
});

describe("real framework lifecycles", () => {
  it("survives React Strict Mode replay, rerenders and conditional root replacement", async () => {
    const root = createRoot(host());
    disposals.push(async () => {
      await act(async () => root.unmount());
    });
    await act(async () => root.render(render("First")));
    await flush();
    expect(descriptions()).toHaveLength(1);
    await act(async () => root.render(render("Changed", "a", "two")));
    await flush();
    expect(descriptions().map((node) => node.textContent)).toEqual(["Changed"]);
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    await act(async () => root.render(render("Replacement", "b")));
    await flush();
    expect(descriptions().map((node) => node.textContent)).toEqual(["Replacement"]);
    await act(async () => root.render(null));
    await flush();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("lets Vue own directive updates and unmounting without application lifecycle hooks", async () => {
    const text = ref("First"),
      options = ref({ className: "one" });
    const app = createApp({
      render: () =>
        withDirectives(h("div", [h("button", { "data-tip": text.value }, "Save")]), [
          [vTipGlide, options.value],
        ]),
    });
    let mounted = true;
    app.mount(host());
    disposals.push(() => {
      if (mounted) app.unmount();
    });
    await nextTick();
    await flush();
    expect(descriptions().map((node) => node.textContent)).toEqual(["First"]);
    text.value = "Changed";
    options.value = { className: "two" };
    await nextTick();
    await flush();
    expect(descriptions().map((node) => node.textContent)).toEqual(["Changed"]);
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    app.unmount();
    mounted = false;
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("provides Svelte's native action update/destroy contract and cleans up before queued mutations", async () => {
    const root = host();
    root.innerHTML = '<button data-tip="First">Save</button>';
    const action = tipGlide(root, { className: "one" })!;
    action.update!({ className: "two" });
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    root.firstElementChild!.setAttribute("data-tip", "Queued");
    action.destroy!();
    await flush();
    expect(descriptions()).toHaveLength(0);
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
});

it("keeps a group trigger visible through attribute text updates, including Astro's binding", async () => {
  const element = host();
  element.innerHTML = '<button data-tip="First">Save</button>';
  const button = element.firstElementChild as HTMLButtonElement;
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 200, 40, 40));
  vi.spyOn(button, "getClientRects").mockReturnValue([
    new DOMRect(100, 200, 40, 40),
  ] as unknown as DOMRectList);
  const binding = bindTipGlide(element);
  disposals.push(binding.destroy);
  button.focus();
  const token = button.getAttribute("aria-describedby");
  button.dataset.tip = "Changed";
  await flush();
  expect(button.getAttribute("aria-describedby")).toBe(token);
  expect(document.querySelector(".tg-position[data-open] .tg-content")?.textContent).toBe(
    "Changed",
  );
});

describe("central application providers", () => {
  it("shares React triggers across components and survives StrictMode ref replay", async () => {
    const root = createRoot(host());
    disposals.push(() => act(() => root.unmount()));
    await act(async () => root.render(reactApp("First")));
    expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
    expect(descriptions().map((n) => n.textContent)).toEqual(["First", "Other"]);
    await act(async () => root.render(reactApp("Changed")));
    expect(descriptions().map((n) => n.textContent)).toEqual(["Changed", "Other"]);
    expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
  });
  it("globally configures Vue text directives and updates/disables individual triggers", async () => {
    const text = ref<string | null>("First");
    const app = createApp({
      render: () =>
        h("main", [
          withDirectives(h("button", "Save"), [[vTipGlide, text.value]]),
          withDirectives(h("button", "Other"), [[vTipGlide, "Other"]]),
        ]),
    });
    app.use(createTipGlidePlugin({ className: "central" }));
    app.mount(host());
    disposals.push(() => app.unmount());
    expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
    text.value = "Changed";
    await nextTick();
    expect(descriptions().map((n) => n.textContent)).toEqual(["Changed", "Other"]);
    text.value = null;
    await nextTick();
    expect(descriptions().map((n) => n.textContent)).toEqual(["Other"]);
  });
});

import "@angular/compiler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { createRoot, createSignal } from "solid-js";
import { mount, unmount, flushSync } from "svelte";
import { writable } from "svelte/store";
import SvelteToolbar from "./fixtures/Toolbar.svelte";
import { TipGlide as PreactTipGlide } from "../src/preact.js";
import { TipGlideDirective } from "../src/angular.js";
import { createTipGlideRef } from "../src/solid.js";
import { registerTipGlideElement } from "../src/adapters/astro-element.js";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const disposals: (() => void | Promise<void>)[] = [];
const descriptions = () =>
  Array.from(document.querySelectorAll(".tg-description"), (n) => n.textContent);
const host = () => {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
};

@Component({
  imports: [TipGlideDirective],
  template: '<div [tipGlide]="options"><button [attr.data-tip]="text">Save</button></div>',
})
class AngularToolbar {
  text = "First";
  options = { className: "one" };
}

beforeEach(() => {
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
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("additional framework lifecycles", () => {
  it("mounts, updates and destroys the standalone Angular directive", async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    TestBed.configureTestingModule({
      imports: [AngularToolbar],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(AngularToolbar);
    fixture.detectChanges();
    TestBed.tick();
    await flush();
    expect(descriptions()).toEqual(["First"]);
    fixture.componentInstance.text = "Changed";
    fixture.componentInstance.options = { className: "two" };
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    TestBed.tick();
    await flush();
    expect(descriptions()).toEqual(["Changed"]);
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    fixture.destroy();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("lets Preact own its wrapper and cleanup", async () => {
    const element = host();
    disposals.push(() => render(null, element));
    act(() =>
      render(
        h(
          PreactTipGlide,
          { options: { className: "one" } },
          h("button", { "data-tip": "First" }, "Save"),
        ),
        element,
      ),
    );
    await flush();
    expect(descriptions()).toEqual(["First"]);
    act(() =>
      render(
        h(
          PreactTipGlide,
          { options: { className: "two" } },
          h("button", { "data-tip": "Changed" }, "Save"),
        ),
        element,
      ),
    );
    await flush();
    expect(descriptions()).toEqual(["Changed"]);
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    act(() => render(null, element));
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("tracks a Solid accessor and cleans up with its owner", async () => {
    const element = host();
    element.innerHTML = '<button data-tip="First">Save</button>';
    let update!: (value: { className: string }) => void;
    createRoot((dispose) => {
      disposals.push(dispose);
      const [options, setOptions] = createSignal({ className: "one" });
      update = setOptions;
      const ref = createTipGlideRef(options);
      ref(element);
    });
    await flush();
    expect(descriptions()).toEqual(["First"]);
    update({ className: "two" });
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    disposals.pop()!();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("runs Svelte action mount, reactive update and unmount in a compiled component", async () => {
    const state = writable({ text: "First", options: { className: "one" } });
    const component = mount(SvelteToolbar, { target: host(), props: { state } });
    let mounted = true;
    disposals.push(async () => {
      if (mounted) await unmount(component);
    });
    flushSync();
    await flush();
    expect(descriptions()).toEqual(["First"]);
    state.set({ text: "Changed", options: { className: "two" } });
    flushSync();
    await flush();
    expect(descriptions()).toEqual(["Changed"]);
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    await unmount(component);
    mounted = false;
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });

  it("connects and reconnects Astro groups without leaked overlays", async () => {
    registerTipGlideElement();
    registerTipGlideElement();
    const element = document.createElement("tip-glide-group");
    element.innerHTML = '<button data-tip="First">Save</button>';
    document.body.append(element);
    await flush();
    expect(descriptions()).toEqual(["First"]);
    element.setAttribute("data-tip-glide-options", JSON.stringify({ className: "two" }));
    expect(document.querySelector(".tg-overlay")!.classList.contains("two")).toBe(true);
    element.remove();
    expect(document.querySelector(".tg-overlay")).toBeNull();
    document.body.append(element);
    await flush();
    expect(descriptions()).toEqual(["First"]);
    element.remove();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
});

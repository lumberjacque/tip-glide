import "@angular/compiler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h, createContext, useContext, act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createApp, h as vue, provide, inject, ref as vueRef, nextTick } from "vue";
import { h as preact, render as preactRender } from "preact";
import { act as preactAct } from "preact/test-utils";
import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { createComponent, createSignal, createRenderEffect } from "solid-js";
import { render as solidRender } from "solid-js/web";
import { mount, unmount, flushSync } from "svelte";
import { writable } from "svelte/store";
import RichToolbar from "./fixtures/RichToolbar.svelte";
import { Tooltip as ReactTooltip, TipGlideProvider as ReactProvider } from "../src/react.js";
import { Tooltip as PreactTooltip, TipGlideProvider as PreactProvider } from "../src/preact.js";
import { Tooltip as VueTooltip, createTipGlidePlugin } from "../src/vue.js";
import { Tooltip as SolidTooltip, TipGlideProvider as SolidProvider } from "../src/solid.js";
import { TipGlideDirective, provideTipGlide } from "../src/angular.js";
import { registerTipGlideElement } from "../src/adapters/astro-element.js";

const disposals: (() => void | Promise<void>)[] = [];
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const preactApp = (text: string) =>
  preact(
    PreactProvider,
    {},
    preact(PreactTooltip, {
      description: "Pro",
      content: preact("b", null, text),
      children: (tipRef) => preact("button", { ref: tipRef }, "Plan"),
    }),
  );
function host() {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
}
function focus() {
  const button = document.querySelector("button")!;
  const rect = new DOMRect(100, 200, 60, 40);
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(button, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
  button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  return button;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      Object.assign(new EventTarget(), {
        matches: media.includes("reduced"),
        media,
      }) as MediaQueryList,
  );
});
afterEach(async () => {
  while (disposals.length) await disposals.pop()!();
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("native framework rich content", () => {
  it("preserves React context, JSX and descriptions through Strict Mode updates", async () => {
    const context = createContext("wrong");
    function Badge({ text }: { text: string }) {
      return h("strong", null, useContext(context) + text);
    }
    const root = createRoot(host());
    disposals.push(async () => {
      await act(() => root.unmount());
    });
    const content = (text: string) =>
      h(
        ReactProvider,
        null,
        h(
          context.Provider,
          { value: "Context: " },
          h(ReactTooltip, {
            description: `Pro plan ${text}`,
            content: h(Badge, { text }),
            children: (ref) => h("button", { ref }, "Plan"),
          }),
        ),
      );
    const app = (text: string) => h(StrictMode, null, content(text));
    await act(() => root.render(app("First")));
    let trigger: HTMLElement;
    await act(() => {
      trigger = focus();
    });
    const badge = document.querySelector(".tg-content strong");
    expect(badge?.textContent).toBe("Context: First");
    const id = trigger!.getAttribute("aria-describedby");
    await act(() => root.render(app("Changed")));
    expect(document.querySelector(".tg-content strong")).toBe(badge);
    expect(badge?.textContent).toBe("Context: Changed");
    expect(trigger!.getAttribute("aria-describedby")).toBe(id);
    expect(document.getElementById(id!)?.textContent).toBe("Pro plan Changed");
    await act(() => root.unmount());
    disposals.pop();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
  it("server-renders rich React triggers without mounting tooltip markup", () => {
    const html = renderToString(
      h(
        ReactProvider,
        null,
        h(ReactTooltip, {
          description: "Pro plan",
          content: h("strong", null, "Hidden badge"),
          children: (ref) => h("button", { ref }, "Plan"),
        }),
      ),
    );
    expect(html).toContain("Plan");
    expect(html).not.toContain("Hidden badge");
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
  it("mounts and updates Preact JSX in the same portal", async () => {
    const node = host();
    disposals.push(() => preactRender(null, node));
    preactAct(() => preactRender(preactApp("First"), node));
    preactAct(() => {
      focus();
    });
    await flush();
    const badge = document.querySelector(".tg-content b");
    expect(badge?.textContent).toBe("First");
    preactAct(() => preactRender(preactApp("Changed"), node));
    await flush();
    expect(document.querySelector(".tg-content b")).toBe(badge);
    expect(badge?.textContent).toBe("Changed");
  });
  it("preserves Vue injections and reactive default slots through Teleport", async () => {
    const value = vueRef("First");
    const Badge = {
      setup() {
        const prefix = inject<string>("prefix");
        return () => vue("em", prefix + value.value);
      },
    };
    const App = {
      setup() {
        provide("prefix", "Context: ");
        return () =>
          vue(
            VueTooltip,
            { description: "Pro" },
            {
              trigger: ({ ref: tipRef }: { ref: (node: unknown) => void }) =>
                vue("button", { ref: tipRef }, "Plan"),
              default: () => vue(Badge),
            },
          );
      },
    };
    const app = createApp(App).use(createTipGlidePlugin());
    app.mount(host());
    disposals.push(() => app.unmount());
    focus();
    await nextTick();
    const badge = document.querySelector(".tg-content em");
    expect(badge?.textContent).toBe("Context: First");
    value.value = "Changed";
    await nextTick();
    expect(document.querySelector(".tg-content em")).toBe(badge);
    expect(badge?.textContent).toBe("Context: Changed");
  });
  it("keeps Solid JSX reactive in its original owner", async () => {
    const [text, setText] = createSignal("First");
    const dispose = solidRender(
      () =>
        createComponent(SolidProvider, {
          get children() {
            return createComponent(SolidTooltip, {
              description: "Pro",
              get content() {
                const badge = document.createElement("strong");
                createRenderEffect(() => {
                  badge.textContent = text();
                });
                return badge;
              },
              children: (tipRef) => {
                const trigger = document.createElement("button");
                tipRef(trigger);
                return trigger;
              },
            });
          },
        }),
      host(),
    );
    disposals.push(dispose);
    await flush();
    focus();
    await flush();
    const badge = document.querySelector(".tg-content strong");
    console.log("SOLID DOM", document.body.innerHTML);
    expect(badge?.textContent).toBe("First");
    setText("Changed");
    expect(document.querySelector(".tg-content strong")).toBe(badge);
    expect(badge?.textContent).toBe("Changed");
  });
  it("compiles Svelte slots with reactive content and action ownership", async () => {
    const state = writable("First");
    const app = mount(RichToolbar, { target: host(), props: { state } });
    disposals.push(() => unmount(app));
    flushSync();
    await flush();
    focus();
    flushSync();
    await flush();
    const badge = document.querySelector(".tg-content strong");
    expect(badge?.textContent).toBe("First");
    state.set("Changed");
    flushSync();
    await flush();
    expect(document.querySelector(".tg-content strong")).toBe(badge);
    expect(badge?.textContent).toBe("Changed");
  });
  it("registers Astro slot templates, restores trigger attributes and reconnects", async () => {
    registerTipGlideElement();
    const group = document.createElement("tip-glide-group");
    group.innerHTML =
      '<tip-glide-tooltip data-description="Pro plan"><span data-tip-trigger><button>Plan</button></span><template id="rich-slot"><strong>Pro</strong></template></tip-glide-tooltip>';
    document.body.append(group);
    await flush();
    const trigger = focus();
    expect(document.querySelector(".tg-content strong")?.textContent).toBe("Pro");
    const component = group.firstElementChild!;
    component.remove();
    await flush();
    expect(trigger.hasAttribute("data-tip-template")).toBe(false);
    expect(document.querySelector(".tg-description")).toBeNull();
    group.append(component);
    await flush();
    focus();
    expect(document.querySelector(".tg-content strong")?.textContent).toBe("Pro");
    group.remove();
    await flush();
    expect(document.querySelector(".tg-overlay")).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [TipGlideDirective],
  template:
    '<button [tipGlide]="badge" [tipGlideContext]="context" [tipGlideDescription]="description">Plan</button><ng-template #badge let-plan><strong>{{plan}}</strong></ng-template>',
})
class AngularBadge {
  context = { $implicit: "First" };
  description = "Pro plan";
}
it("owns Angular TemplateRef context, live embedded views and destruction", async () => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  TestBed.configureTestingModule({
    imports: [AngularBadge],
    providers: [provideZonelessChangeDetection(), provideTipGlide()],
  });
  const fixture = TestBed.createComponent(AngularBadge);
  fixture.detectChanges();
  await fixture.whenStable();
  const trigger = focus();
  const id = trigger.getAttribute("aria-describedby"),
    badge = document.querySelector(".tg-content strong");
  expect(badge?.textContent).toBe("First");
  fixture.componentInstance.context = { $implicit: "Changed" };
  fixture.componentInstance.description = "Updated plan";
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(document.querySelector(".tg-content strong")).toBe(badge);
  expect(badge?.textContent).toBe("Changed");
  expect(trigger.getAttribute("aria-describedby")).toBe(id);
  expect(document.getElementById(id!)?.textContent).toBe("Updated plan");
  fixture.destroy();
  expect(document.querySelector(".tg-overlay")).toBeNull();
});

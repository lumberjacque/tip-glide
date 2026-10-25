import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRichTipGlide, createRichTipGlideScope, richContent } from "../src/rich.js";

const disposals: (() => void)[] = [];
beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      Object.assign(new EventTarget(), {
        matches: media.includes("reduced"),
        media,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  while (disposals.length) disposals.pop()!();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function button() {
  const node = document.createElement("button");
  document.body.append(node);
  const rect = new DOMRect(100, 200, 60, 40);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(node, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
  return node;
}
const focus = (node: HTMLElement) =>
  node.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

describe("rich content ownership", () => {
  it("keeps a fuse preview mounted when its opening delay completes, and cleans up cancelled previews", () => {
    vi.useFakeTimers();
    vi.mocked(window.matchMedia).mockImplementation(
      (media) => Object.assign(new EventTarget(), { matches: true, media }) as MediaQueryList,
    );
    const trigger = button(),
      mount = vi.fn((host: HTMLElement) => {
        host.textContent = "Badge";
        return cleanup;
      });
    const cleanup = vi.fn();
    const tips = createRichTipGlide(document, { showFuse: true, openDelay: 400 });
    disposals.push(() => tips.destroy());
    tips.add(trigger, richContent("Pro plan", mount));
    trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(mount).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    tips.hide();
    expect(cleanup).toHaveBeenCalledTimes(1);
    tips.update({ warmDuration: 0 });
    trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    trigger.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it("mounts one real DOM tree lazily, preserves description IDs and cleans up exactly once", () => {
    const trigger = button();
    const tips = createRichTipGlide(document, { arrow: true });
    disposals.push(() => tips.destroy());
    const cleanup = vi.fn();
    const render = vi.fn((host: HTMLElement) => {
      const badge = document.createElement("strong");
      badge.textContent = "Pro";
      host.append(badge);
      return cleanup;
    });
    tips.add(trigger, richContent("Pro plan", render));
    const id = trigger.getAttribute("aria-describedby");
    expect(render).not.toHaveBeenCalled();
    tips.show(trigger);
    const badge = document.querySelector(".tg-content strong");
    expect(badge?.textContent).toBe("Pro");
    expect(document.querySelector(".tg-rich-content")?.hasAttribute("inert")).toBe(true);
    tips.reposition();
    tips.setContent(trigger, richContent("Updated plan", render));
    expect(document.querySelector(".tg-content strong")).toBe(badge);
    expect(render).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-describedby")).toBe(id);
    expect(document.getElementById(id!)?.textContent).toBe("Updated plan");
    tips.hide();
    tips.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });
  it("restores a moved source element and its sibling order after handoff to plain text", () => {
    const source = document.createElement("span"),
      sibling = document.createElement("i");
    source.textContent = "Badge";
    document.body.append(source, sibling);
    const a = button(),
      b = button();
    const tips = createRichTipGlide(document);
    disposals.push(() => tips.destroy());
    tips.add(a, richContent("Badge description", source));
    tips.add(b, "Plain");
    tips.show(a);
    expect(source.closest(".tg-rich-content")).not.toBeNull();
    tips.show(b);
    expect(source.parentNode).toBe(document.body);
    expect(source.nextSibling).toBe(sibling);
    expect(document.querySelector(".tg-position .tg-content")?.textContent).toBe("Plain");
  });
  it("shares a lazy scope, replaces renderers in place, disables and unregisters without leaking", () => {
    const scope = createRichTipGlideScope({ arrow: true });
    disposals.push(() => scope.destroy());
    const a = button(),
      b = button(),
      clean = vi.fn();
    const binding = scope.attach(
      a,
      richContent("First", (host) => {
        host.textContent = "Visual";
        return clean;
      }),
    );
    const other = scope.attach(b, "Other");
    expect(document.querySelectorAll(".tg-overlay")).toHaveLength(1);
    focus(a);
    binding.update(
      richContent("Second", (host) => {
        host.innerHTML = "<em>New visual</em>";
      }),
    );
    expect(clean).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".tg-content em")?.textContent).toBe("New visual");
    binding.update(null);
    other.destroy();
    expect(document.querySelector(".tg-overlay")).toBeNull();
    expect(a.hasAttribute("aria-describedby")).toBe(false);
  });
  it("cleans a renderer that throws and allows later valid content", () => {
    const trigger = button(),
      tips = createRichTipGlide(document);
    disposals.push(() => tips.destroy());
    tips.add(
      trigger,
      richContent("Broken", () => {
        throw new Error("Mount failed");
      }),
    );
    expect(() => tips.show(trigger)).toThrow("Mount failed");
    expect(document.querySelector(".tg-rich-content")).toBeNull();
    tips.setContent(trigger, "Recovered");
    tips.show(trigger);
    expect(document.querySelector(".tg-position .tg-content")?.textContent).toBe("Recovered");
  });
  it("rejects HTML strings as renderer sources and requires an accessible equivalent", () => {
    expect(() => richContent("", () => {})).toThrow("description");
    // @ts-expect-error HTML source strings are intentionally not accepted.
    expect(() => richContent("Badge", "<strong>Badge</strong>")).toThrow("renderer");
    const scope = createRichTipGlideScope();
    disposals.push(() => scope.destroy());
    // @ts-expect-error Unbranded objects cannot become rich content or configuration.
    expect(() => scope.attach(button(), { description: "Badge" })).toThrow("richContent");
  });
  it("renders literal HTML-looking text without parsing it", () => {
    const tips = createRichTipGlide(document),
      trigger = button();
    disposals.push(() => tips.destroy());
    tips.add(trigger, "<strong>Literal</strong>");
    tips.show(trigger);
    expect(document.querySelector(".tg-position strong")).toBeNull();
    expect(document.querySelector(".tg-position .tg-content")?.textContent).toBe(
      "<strong>Literal</strong>",
    );
  });
});

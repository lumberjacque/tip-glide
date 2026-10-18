import { createOverlay } from "./overlay.js";
import { getViewport } from "./geometry.js";
import type { BaseOptions } from "./base-options.js";

let sequence = 0;
const anchors = new WeakMap<HTMLElement, { value: string; priority: string; names: Set<string> }>();
function attach(trigger: HTMLElement, name: string) {
  let state = anchors.get(trigger);
  if (!state) {
    state = {
      value: trigger.style.getPropertyValue("anchor-name"),
      priority: trigger.style.getPropertyPriority("anchor-name"),
      names: new Set(),
    };
    anchors.set(trigger, state);
  }
  state.names.add(name);
  const write = () =>
    trigger.style.setProperty(
      "anchor-name",
      [state.value !== "none" ? state.value : "", ...state.names].filter(Boolean).join(", "),
      "important",
    );
  write();
  return () => {
    state.names.delete(name);
    if (state.names.size) write();
    else {
      if (state.value) trigger.style.setProperty("anchor-name", state.value, state.priority);
      else trigger.style.removeProperty("anchor-name");
      anchors.delete(trigger);
    }
  };
}
const noop = () => {};
export function createNativeView(doc: Document, win: Window) {
  const host = createOverlay(doc, "tg-overlay tg-native"),
    overlay = host.element;
  const position = doc.createElement("div");
  position.className = "tg-position tg-content";
  overlay.append(position);
  const name = `--tip-glide-anchor-${++sequence}`;
  let anchor: HTMLElement | undefined;
  let release = noop;
  return {
    tracksAnchor: true,
    baseClass: overlay.className,
    overlay,
    position,
    measurement: position,
    bounds: () => getViewport(win),
    render(trigger: HTMLElement, text: string, config: BaseOptions, instant: boolean) {
      if (anchor !== trigger) {
        release();
        anchor = trigger;
        release = attach(trigger, name);
      }
      host.present(trigger);
      if (position.textContent !== text) {
        position.textContent = text;
        position.scrollTop = 0;
      }
      position.style.setProperty("position-anchor", name);
      position.style.setProperty("position-area", config.placement);
      position.style.setProperty("--tg-gap", `${config.gap}px`);
      position.style.setProperty("--tg-viewport-padding", `${config.viewportPadding}px`);
      position.style.transitionDuration = instant ? "0s" : "";
      position.setAttribute("data-open", "");
      return "";
    },
    hide(instant: boolean) {
      position.removeAttribute("data-open");
      position.style.transitionDuration = instant ? "0s" : "";
      host.conceal(instant ? 0 : 140);
      // Keep the CSS anchor through the exit fade. Release on retarget/destroy.
    },
    startFuse: noop,
    stopFuse: noop,
    destroy() {
      release();
      host.destroy();
    },
  };
}

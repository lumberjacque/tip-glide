import { createOverlay } from "./overlay.js";
import { clamp, getViewport, opposite } from "./geometry.js";
import type { BaseOptions } from "./base-options.js";

const noop = () => {};

export function createBaseView(doc: Document, win: Window) {
  const div = (name: string) => {
    const node = doc.createElement("div");
    node.className = name;
    return node;
  };
  const host = createOverlay(doc, "tg-overlay tg-base");
  const overlay = host.element,
    position = div("tg-position"),
    backdrop = div("tg-backdrop"),
    clip = div("tg-clip"),
    content = div("tg-content"),
    measurement = div("tg-content tg-measure");
  clip.append(content);
  position.append(backdrop, clip);
  overlay.append(position, measurement);
  let visible = false;
  function render(trigger: HTMLElement, text: string, config: BaseOptions, instant: boolean) {
    host.present(trigger);
    overlay.className = `tg-overlay tg-base ${config.className}`;
    const bounds = getViewport(win),
      padding = config.viewportPadding;
    for (const node of [content, measurement]) {
      node.style.maxWidth = `min(var(--tg-max-width), ${Math.max(1, bounds.width - padding * 2)}px)`;
      node.style.maxHeight = `min(var(--tg-max-height), ${Math.max(1, bounds.height - padding * 2)}px)`;
    }
    measurement.textContent = text;
    const measured = measurement.getBoundingClientRect(),
      anchor = trigger.getBoundingClientRect();
    const width = Math.ceil(measured.width || measurement.offsetWidth),
      height = Math.ceil(measured.height || measurement.offsetHeight);
    const geometry = [
      anchor.x,
      anchor.y,
      anchor.width,
      anchor.height,
      measurement.offsetWidth,
      measurement.offsetHeight,
    ].join(",");
    const left = bounds.x + padding,
      top = bounds.y + padding,
      right = bounds.x + bounds.width - padding - width,
      bottom = bounds.y + bounds.height - padding - height;
    const candidates = {
      top: { x: anchor.x + (anchor.width - width) / 2, y: anchor.y - height - config.gap },
      bottom: { x: anchor.x + (anchor.width - width) / 2, y: anchor.bottom + config.gap },
      left: { x: anchor.x - width - config.gap, y: anchor.y + (anchor.height - height) / 2 },
      right: { x: anchor.right + config.gap, y: anchor.y + (anchor.height - height) / 2 },
    };
    let side = config.placement;
    const fits = (point: { x: number; y: number }) =>
      point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    if (!fits(candidates[side]) && fits(candidates[opposite[side]])) side = opposite[side];
    const target = {
      x: clamp(candidates[side].x, left, right),
      y: clamp(candidates[side].y, top, bottom),
    };
    const duration = visible && !instant ? config.duration : 0;
    const changed = content.textContent !== text;
    content.textContent = text;
    content.style.width = `${width}px`;
    if (changed) content.scrollTop = 0;
    content.getAnimations?.().forEach((animation) => animation.cancel());
    if (changed && !instant && typeof content.animate === "function") {
      const animation = content.animate(
        [{ opacity: 0 }, { opacity: 0, offset: duration / (duration + 100) }, { opacity: 1 }],
        { duration: duration + 100, easing: "linear" },
      );
      void animation.finished.catch(() => {});
    }
    position.style.setProperty("--tg-duration", duration + "ms");
    position.style.transition = instant ? "none" : "";
    position.dataset.placement = side;
    position.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
    position.style.width = width + "px";
    position.style.height = height + "px";
    position.setAttribute("data-open", "");
    visible = true;
    return geometry;
  }
  return {
    baseClass: overlay.className,
    overlay,
    position,
    measurement,
    render,
    bounds: () => getViewport(win),
    hide(instant: boolean) {
      content.getAnimations?.().forEach((animation) => animation.cancel());
      position.style.transition = instant ? "none" : "";
      position.removeAttribute("data-open");
      visible = false;
      host.conceal(instant ? 0 : 140);
    },
    startFuse: noop,
    stopFuse: noop,
    destroy() {
      content.getAnimations?.().forEach((animation) => animation.cancel());
      host.destroy();
    },
  };
}

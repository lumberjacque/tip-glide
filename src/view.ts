import { createOverlay } from "./overlay.js";
import { clamp, getBoundary, opposite, place, pointer, route } from "./geometry.js";
import type { Rect } from "./geometry.js";
import { createPathSampler, easeOut } from "./motion.js";
import { skin } from "./skin.js";
import type { Options } from "./options.js";
import type { TipTransition } from "./types.js";
import type { ContentPresentation } from "./view-contract.js";

const out = "cubic-bezier(0.23, 1, 0.32, 1)";
const cancel = (node: HTMLElement) =>
  node.getAnimations?.().forEach((animation) => animation.cancel());
function animate(node: HTMLElement, frames: Keyframe[], duration: number, easing = out) {
  if (!duration || typeof node.animate !== "function") return undefined;
  const animation = node.animate(frames, { duration, easing });
  void animation.finished.catch(() => {});
  return animation;
}

export function createView(doc: Document, win: Window, rich?: ContentPresentation) {
  const div = (name: string) => {
    const node = doc.createElement("div");
    node.className = name;
    return node;
  };
  const host = createOverlay(doc, "tg-overlay");
  const overlay = host.element;
  const position = div("tg-position"),
    motion = div("tg-motion"),
    surface = div("tg-surface");
  position.style.transition = "none";
  const backdrop = div("tg-backdrop"),
    clip = div("tg-clip"),
    content = div("tg-content");
  const measurement = div("tg-content tg-measure"),
    fuse = div("tg-fuse");
  let contour: { svg: SVGSVGElement; path: SVGPathElement } | undefined;
  fuse.hidden = true;
  clip.append(content);
  surface.append(backdrop, clip);
  motion.append(surface);
  position.append(motion);
  overlay.append(position, measurement, fuse);
  let state = { x: 0, y: 0, width: 0, height: 0 };
  let visible = false,
    lastTrigger: HTMLElement | undefined;
  let richActive = false;
  let anchor: Rect = { x: 0, y: 0, width: 0, height: 0 };
  let boundary: Rect = { x: 0, y: 0, width: 0, height: 0 };
  let config: Options | undefined;
  let radius = 12,
    tilt = 0,
    tiltVelocity = 0;
  let pendingText: { width: number; height: number } | undefined;
  let frame: number | undefined,
    fuseAnimation: Animation | undefined,
    exitAnimation: Animation | undefined;

  function stopTravel() {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = undefined;
  }
  function presentation() {
    const style = win.getComputedStyle(motion);
    return { opacity: style.opacity, transform: style.transform };
  }
  function paint() {
    if (!config) return;
    state.x = clamp(
      state.x,
      boundary.x + config.viewportPadding,
      boundary.x + boundary.width - config.viewportPadding - state.width,
    );
    state.y = clamp(
      state.y,
      boundary.y + config.viewportPadding,
      boundary.y + boundary.height - config.viewportPadding - state.height,
    );
    position.style.width = `${state.width}px`;
    position.style.height = `${state.height}px`;
    position.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    if (
      pendingText &&
      state.width >= pendingText.width - 0.05 &&
      state.height >= pendingText.height - 0.05
    ) {
      content.style.opacity = "1";
      animate(content, [{ opacity: 0 }, { opacity: 1 }], 100);
      pendingText = undefined;
    }
    const marginX = Math.max(
      0,
      Math.min(state.x - boundary.x, boundary.x + boundary.width - state.x - state.width),
    );
    const marginY = Math.max(
      0,
      Math.min(state.y - boundary.y, boundary.y + boundary.height - state.y - state.height),
    );
    const limit = Math.min(
      8,
      ((marginY / (state.width / 2 + 1)) * 180) / Math.PI,
      ((marginX / (state.height / 2 + 1)) * 180) / Math.PI,
    );
    const angle = clamp(tilt, -limit, limit);
    surface.style.transform = `rotate(${angle}deg)`;
    const dx = anchor.x + (anchor.width - state.width) / 2 - state.x,
      dy = anchor.y + (anchor.height - state.height) / 2 - state.y;
    if (config.arrow) {
      if (!contour) {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        svg.setAttribute("class", "tg-skin");
        svg.append(path);
        surface.append(svg);
        contour = { svg, path };
      }
      const { svg, path } = contour;
      const radians = (-angle * Math.PI) / 180,
        cosine = Math.cos(radians),
        sine = Math.sin(radians);
      const local = {
        x: state.width / 2 + dx * cosine - dy * sine,
        y: state.height / 2 + dx * sine + dy * cosine,
      };
      const box = `-14 -14 ${state.width + 28} ${state.height + 28}`;
      if (svg.getAttribute("viewBox") !== box) {
        svg.setAttribute("viewBox", box);
        svg.style.width = `${state.width + 28}px`;
        svg.style.height = `${state.height + 28}px`;
      }
      path.setAttribute("d", skin(state.width, state.height, radius, local, config.arrowBlend));
    }
    const attachment = pointer(anchor, state, state);
    position.dataset.placement = opposite[attachment.side];
    position.dataset.angle = String(
      Math.round((((Math.atan2(-dx, dy) * 180) / Math.PI + 360) % 360) * 10) / 10,
    );
  }

  function measure(trigger: HTMLElement, text: string, options: Options) {
    overlay.className = `tg-overlay ${options.className}`.trim();
    const bounds = getBoundary(win, options.boundary);
    const width = Math.max(1, bounds.width - options.viewportPadding * 2),
      height = Math.max(1, bounds.height - options.viewportPadding * 2);
    for (const node of [content, measurement]) {
      node.style.maxWidth = `min(var(--tg-max-width), ${width}px)`;
      node.style.maxHeight = `min(var(--tg-max-height), ${height}px)`;
    }
    richActive = rich?.present(trigger, content) ?? false;
    const measuring = richActive ? content : measurement;
    if (richActive) content.style.width = "max-content";
    else measurement.textContent = text;
    // offsetWidth rounds down at half pixels, which can wrap a final word onto an unmeasured line.
    const measured = measuring.getBoundingClientRect();
    const size = {
      width: Math.ceil(measured.width || measuring.offsetWidth),
      height: Math.ceil(measured.height || measuring.offsetHeight),
    };
    const rect = trigger.getBoundingClientRect();
    return {
      size,
      rect,
      bounds,
      geometry: [
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        measuring.offsetWidth,
        measuring.offsetHeight,
        ...(options.boundary ? Object.values(bounds) : []),
      ].join(","),
      next: place(rect, size, bounds, options.placement, options.gap, options.viewportPadding),
    };
  }

  function transition(
    effect: TipTransition,
    exiting: boolean,
    instant: boolean,
    initial?: Keyframe,
  ) {
    cancel(motion);
    if (instant || effect === "none") return undefined;
    let frames: Keyframe[],
      duration = exiting ? 140 : 180,
      easing = out;
    if (typeof effect === "object") {
      frames = effect.keyframes.slice();
      duration = effect.duration ?? duration;
      easing = effect.easing ?? easing;
    } else if (effect === "fade") {
      // Opacity should change evenly rather than snap through the travel ease-out.
      frames = exiting ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
      easing = "linear";
    } else {
      const angle = (Number(position.dataset.angle ?? 0) * Math.PI) / 180;
      const transform =
        effect === "scale"
          ? "scale(0.9)"
          : effect === "slide"
            ? `translate(${Math.sin(angle) * 10}px, ${-Math.cos(angle) * 10}px)`
            : "none";
      const hidden = { opacity: 0, transform },
        shown = { opacity: 1, transform: "none" };
      frames = exiting ? [shown, hidden] : [hidden, shown];
    }
    if (initial)
      frames[0] = { ...frames[0], ...(effect === "fade" ? { opacity: initial.opacity } : initial) };
    return animate(motion, frames, duration, easing);
  }

  function render(
    trigger: HTMLElement,
    text: string,
    options: Options,
    instant: boolean,
    contentChanged: boolean,
  ) {
    host.present(trigger);
    const reopening = !!exitAnimation;
    const initial = reopening && !instant ? presentation() : undefined;
    exitAnimation?.cancel();
    exitAnimation = undefined;
    stopTravel();
    const { size, rect, bounds, next, geometry } = measure(trigger, text, options);
    const from = { ...state },
      target = { x: next.x, y: next.y, ...size };
    const same = lastTrigger === trigger;
    anchor = rect;
    boundary = bounds;
    config = options;
    if (contour) contour.svg.style.display = options.arrow ? "" : "none";
    if (options.arrow)
      radius = parseFloat(win.getComputedStyle(backdrop).borderTopLeftRadius) || 12;
    if (!richActive) content.style.width = `${size.width}px`;
    if (contentChanged || (!richActive && content.textContent !== text)) {
      cancel(content);
      if (!richActive) content.textContent = text;
      content.scrollTop = 0;
      pendingText = visible && !instant && options.duration ? size : undefined;
      content.style.opacity = pendingText ? "0" : "1";
    }
    motion.style.transformOrigin = next.origin;
    if (instant) {
      cancel(motion);
      cancel(content);
      pendingText = undefined;
      content.style.opacity = "1";
    }
    const duration = visible && !instant ? options.duration : 0;
    const resized = from.width !== size.width || from.height !== size.height;
    if (
      duration &&
      from.width &&
      from.height &&
      (tilt || tiltVelocity || from.x !== target.x || from.y !== target.y || resized)
    ) {
      const travelPath =
        same && !resized
          ? route(from, target, rect, size, bounds, options.gap, options.viewportPadding)
          : [from, target];
      const sample = createPathSampler(travelPath);
      const start = win.performance.now();
      let previous = start;
      const tick = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start) / duration)),
          p = easeOut(progress);
        const point = sample(p),
          dt = Math.min(0.032, Math.max(0.001, (now - previous) / 1000));
        const desired =
          options.lean && progress < 1
            ? clamp(((point.x - state.x) / dt) * 0.004 + ((point.y - state.y) / dt) * 0.001, -8, 8)
            : 0;
        tiltVelocity += ((desired - tilt) * 260 - tiltVelocity * 26) * dt;
        tilt = options.lean ? clamp(tilt + tiltVelocity * dt, -8, 8) : 0;
        state = {
          ...point,
          width: from.width + (size.width - from.width) * p,
          height: from.height + (size.height - from.height) * p,
        };
        previous = now;
        paint();
        if (progress < 1 || (Math.abs(tilt) > 0.03 && now - start < duration + 280))
          frame = win.requestAnimationFrame(tick);
        else {
          tilt = 0;
          tiltVelocity = 0;
          state = target;
          paint();
          frame = undefined;
        }
      };
      frame = win.requestAnimationFrame(tick);
      paint();
    } else {
      tilt = 0;
      tiltVelocity = 0;
      state = target;
      paint();
    }
    if (!visible) transition(options.enter, false, instant, initial);
    visible = true;
    lastTrigger = trigger;
    position.setAttribute("data-open", "");
    position.style.removeProperty("pointer-events");
    return geometry;
  }

  function hide(instant: boolean) {
    if (!visible || !config) return;
    visible = false;
    stopTravel();
    position.style.pointerEvents = "none";
    const initial = instant || config.exit === "none" ? undefined : presentation();
    exitAnimation = transition(config.exit, true, instant, initial);
    if (exitAnimation) {
      const current = exitAnimation;
      current.onfinish = () => {
        if (exitAnimation !== current) return;
        position.removeAttribute("data-open");
        host.conceal();
        rich?.clear();
        exitAnimation = undefined;
      };
    } else {
      position.removeAttribute("data-open");
      host.conceal();
      rich?.clear();
    }
  }
  function stopFuse() {
    fuseAnimation?.cancel();
    fuseAnimation = undefined;
    fuse.hidden = true;
    if (!visible && !exitAnimation) {
      host.conceal();
      rich?.clear();
    }
  }
  function startFuse(
    trigger: HTMLElement,
    text: string,
    delay: number,
    options: Options,
    reduced: boolean,
  ) {
    stopFuse();
    if (!options.showFuse || !delay) return;
    host.present(trigger);
    const { next, rect, bounds } = measure(trigger, text, options);
    const side = next.placement,
      horizontal = side === "top" || side === "bottom";
    fuse.style.width = `${horizontal ? rect.width : 2}px`;
    fuse.style.height = `${horizontal ? 2 : rect.height}px`;
    const x = side === "left" ? rect.left - 5 : side === "right" ? rect.right + 3 : rect.left;
    const y = side === "top" ? rect.top - 5 : side === "bottom" ? rect.bottom + 3 : rect.top;
    fuse.style.transform = `translate(${clamp(x, bounds.x, bounds.x + bounds.width - (horizontal ? rect.width : 2))}px, ${clamp(y, bounds.y, bounds.y + bounds.height - (horizontal ? 2 : rect.height))}px)`;
    fuse.hidden = false;
    fuseAnimation = reduced
      ? undefined
      : animate(
          fuse,
          [
            { clipPath: horizontal ? "inset(0 100% 0 0)" : "inset(0 0 100% 0)" },
            { clipPath: "inset(0)" },
          ],
          delay,
          "linear",
        );
  }
  return {
    baseClass: overlay.className,
    get animatedContent() {
      return richActive;
    },
    overlay,
    position,
    get measurement() {
      return richActive ? content : measurement;
    },
    bounds: (options: Options) => getBoundary(win, options.boundary),
    render,
    hide,
    startFuse,
    stopFuse,
    destroy() {
      stopTravel();
      rich?.clear();
      overlay.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
      host.destroy();
    },
  };
}

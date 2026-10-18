import { trackRemoval } from "./removals.js";
import { intersects } from "./geometry.js";

import type { ControllerOptions, ControllerView } from "./view-contract.js";

let sequence = 0;
interface Entry {
  description: HTMLElement;
  cleanup: () => void;
}

export function createController<Input, Config extends ControllerOptions>(
  root: Document | HTMLElement,
  options: Input,
  resolve: (input: Input, previous: Config | undefined, win: Window & typeof globalThis) => Config,
  createView: (doc: Document, win: Window) => ControllerView<Config>,
) {
  const doc = root.nodeType === 9 ? (root as Document) : (root as HTMLElement).ownerDocument;
  const win = doc.defaultView;
  if (!win || !doc.body)
    throw new Error("tip-glide: create a group in a browser after the document body exists.");
  let config = resolve(options, undefined, win);
  const view = createView(doc, win);
  const entries = new Map<HTMLElement, Entry>();
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  const hoverMedia = win.matchMedia("(any-hover: hover)");
  const reduced = () => config.motion === "reduced" || media.matches;
  let active: HTMLElement | undefined;
  let hovered: HTMLElement | undefined;
  let focused: HTMLElement | undefined;
  let pending: HTMLElement | undefined;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  let frame: number | undefined;
  let lastClosed = -Infinity;
  let destroyed = false;
  let touch = false;
  let pointerFocus = false;
  let press:
    | {
        id: number;
        x: number;
        y: number;
        trigger: HTMLElement;
        wasOpen: boolean;
        down: boolean;
        dragged: boolean;
      }
    | undefined;
  let instantPresentation = false;
  const removers: (() => void)[] = [];
  let observedGeometry = "";
  function geometryKey() {
    if (!active) return "";
    const rect = active.getBoundingClientRect();
    return [
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      view.measurement.offsetWidth,
      view.measurement.offsetHeight,
      ...(config.boundary ? Object.values(view.bounds(config)) : []),
    ].join(",");
  }
  const resize =
    !view.tracksAnchor && typeof win.ResizeObserver === "function"
      ? new win.ResizeObserver(() => {
          // ResizeObserver sends an initial notification. It must not cancel a new glide.
          if (active && geometryKey() !== observedGeometry) schedulePosition();
        })
      : undefined;

  function listen(target: EventTarget, type: string, handler: EventListener, capture = false) {
    target.addEventListener(type, handler, capture);
    removers.push(() => target.removeEventListener(type, handler, capture));
  }

  function cancelOpen() {
    win!.clearTimeout(openTimer);
    openTimer = undefined;
    pending = undefined;
    view.stopFuse();
  }

  function cancelClose() {
    win!.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function dismiss(instant = false) {
    cancelOpen();
    cancelClose();
    if (active) lastClosed = win!.performance.now();
    active = undefined;
    resize?.disconnect();
    view.hide(instant || reduced());
  }

  function reset() {
    hovered = undefined;
    focused = undefined;
    dismiss(true);
  }

  function observe(trigger: HTMLElement) {
    if (view.tracksAnchor) return;
    resize?.disconnect();
    resize?.observe(trigger);
    resize?.observe(view.measurement);
    if (config.boundary) resize?.observe(config.boundary);
  }

  function open(trigger: HTMLElement, instant = false) {
    if (destroyed || !trigger.isConnected || !entries.has(trigger)) return;
    if (!view.tracksAnchor && !intersects(trigger.getBoundingClientRect(), view.bounds(config))) {
      dismiss(true);
      return;
    }
    cancelOpen();
    cancelClose();
    const changed = active !== trigger;
    active = trigger;
    instantPresentation = instant;
    const entry = entries.get(trigger)!;
    view.position.style.removeProperty("pointer-events");
    observedGeometry = view.render(
      trigger,
      entry.description.textContent ?? "",
      config,
      instant || reduced(),
      changed,
    );
    observe(trigger);
  }

  function requestOpen(trigger: HTMLElement) {
    cancelClose();
    if (active === trigger || pending === trigger) return;
    cancelOpen();
    const delay =
      active || win!.performance.now() - lastClosed < config.warmDuration ? 0 : config.openDelay;
    if (!delay) {
      open(trigger);
      return;
    }
    pending = trigger;
    view.startFuse(
      trigger,
      entries.get(trigger)?.description.textContent ?? "",
      delay,
      config,
      reduced(),
    );
    openTimer = win!.setTimeout(() => open(trigger), delay);
  }

  function requestClose() {
    cancelOpen();
    cancelClose();
    closeTimer = win!.setTimeout(() => dismiss(), config.closeDelay);
  }

  function reposition(immediate = false) {
    if (destroyed || !active) return;
    if (view.tracksAnchor) {
      view.render(
        active,
        entries.get(active)?.description.textContent ?? "",
        config,
        immediate || reduced(),
        false,
      );
      return;
    }
    if (
      !active.isConnected ||
      !active.getClientRects().length ||
      !intersects(active.getBoundingClientRect(), view.bounds(config))
    ) {
      dismiss(true);
      return;
    }
    observedGeometry = view.render(
      active,
      entries.get(active)?.description.textContent ?? "",
      config,
      immediate || instantPresentation || reduced(),
      false,
    );
  }

  function schedulePosition(event?: Event) {
    if (destroyed || event?.composedPath().includes(view.position)) return;
    // A scroll invalidates the delay indicator's coordinates; the next hover can start again.
    cancelOpen();
    if (frame !== undefined) return;
    frame = win!.requestAnimationFrame(() => {
      frame = undefined;
      reposition(true);
    });
  }

  function find(event: Event): HTMLElement | undefined {
    for (const node of event.composedPath())
      if (entries.has(node as HTMLElement)) return node as HTMLElement;
  }

  function stillInside(trigger: HTMLElement, related: EventTarget | null) {
    return related instanceof win!.Node && trigger.contains(related);
  }

  function add(trigger: HTMLElement, text = trigger.getAttribute("data-tip") ?? "") {
    if (destroyed) return () => {};
    if (trigger.ownerDocument !== doc)
      throw new TypeError("tip-glide: all triggers must belong to the same document.");
    entries.get(trigger)?.cleanup();
    if (!text.trim()) return () => {};
    const description = doc.createElement("span");
    do {
      description.id = `tip-glide-${++sequence}`;
    } while (doc.getElementById(description.id));
    description.className = "tg-description";
    description.setAttribute("role", "tooltip");
    // Referenced hidden text remains an accessible description without cluttering browse order.
    description.hidden = true;
    description.textContent = text;
    doc.body.append(description);
    const untrack = trackRemoval(trigger, () => entry.cleanup());
    const tokens = (trigger.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    trigger.setAttribute("aria-describedby", [...tokens, description.id].join(" "));
    const entry: Entry = {
      description,
      cleanup() {
        if (entries.get(trigger) !== entry) return;
        entries.delete(trigger);
        untrack();
        const remaining = (trigger.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter((id) => id && id !== description.id);
        if (remaining.length) trigger.setAttribute("aria-describedby", remaining.join(" "));
        else trigger.removeAttribute("aria-describedby");
        description.remove();
        if (hovered === trigger) hovered = undefined;
        if (focused === trigger) focused = undefined;
        if (active === trigger || pending === trigger) dismiss(true);
      },
    };
    entries.set(trigger, entry);
    return entry.cleanup;
  }

  listen(doc, "pointerover", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch" || !hoverMedia.matches || (press?.down && press.dragged))
      return;
    const trigger = find(event);
    if (!trigger || stillInside(trigger, pointer.relatedTarget)) return;
    hovered = trigger;
    requestOpen(trigger);
  });
  listen(doc, "pointerout", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch") return;
    const trigger = find(event);
    if (!trigger || stillInside(trigger, pointer.relatedTarget) || hovered !== trigger) return;
    hovered = undefined;
    if (focused && entries.has(focused)) open(focused, true);
    else requestClose();
  });
  listen(view.position, "pointerenter", () => cancelClose());
  listen(view.position, "pointerleave", (event) => {
    if ((event as PointerEvent).pointerType === "touch") return;
    if (hovered) requestOpen(hovered);
    else if (focused) open(focused, true);
    else requestClose();
  });
  listen(
    doc,
    "pointerdown",
    (event) => {
      const pointer = event as PointerEvent;
      touch = pointer.pointerType === "touch";
      pointerFocus = !touch;
      press = undefined;
      if (event.composedPath().includes(view.position)) return;
      const trigger = pointer.button === 0 ? find(event) : undefined;
      if (trigger)
        press = {
          id: pointer.pointerId,
          x: pointer.clientX,
          y: pointer.clientY,
          trigger,
          wasOpen: active === trigger,
          down: true,
          dragged: false,
        };
      if (touch) dismiss(true);
    },
    true,
  );
  listen(doc, "pointermove", (event) => {
    const pointer = event as PointerEvent;
    if (!press?.down || press.id !== pointer.pointerId || press.dragged) return;
    if (Math.hypot(pointer.clientX - press.x, pointer.clientY - press.y) <= 6) return;
    press.dragged = true;
    if (config.hideOnDrag) reset();
  });
  listen(doc, "pointerup", (event) => {
    if (press?.id === (event as PointerEvent).pointerId) press.down = false;
  });
  listen(doc, "pointercancel", () => {
    press = undefined;
  });
  listen(doc, "dragstart", (event) => {
    if (press) press.dragged = true;
    if (config.hideOnDrag && find(event)) reset();
  });
  listen(doc, "click", (event) => {
    const previous = press;
    press = undefined;
    if (
      !touch ||
      config.touch !== "tap" ||
      !previous ||
      previous.dragged ||
      previous.down ||
      find(event) !== previous.trigger
    )
      return;
    if (previous.wasOpen) dismiss(true);
    else open(previous.trigger);
  });
  listen(doc, "focusin", (event) => {
    const trigger = find(event);
    if (!trigger || touch || press?.dragged) return;
    focused = trigger;
    open(trigger, !pointerFocus);
  });
  listen(doc, "focusout", (event) => {
    const trigger = find(event);
    if (trigger !== focused) return;
    focused = undefined;
    if (hovered) requestOpen(hovered);
    else dismiss(!pointerFocus);
  });
  listen(
    doc,
    "keydown",
    (event) => {
      press = undefined;
      touch = false;
      pointerFocus = false;
      if ((event as KeyboardEvent).key === "Escape") {
        reset();
      }
    },
    true,
  );
  if (!view.tracksAnchor) {
    listen(doc, "scroll", schedulePosition, true);
    listen(win, "resize", schedulePosition);
  }
  listen(win, "blur", reset);
  listen(doc, "visibilitychange", () => {
    if (doc.hidden) reset();
  });
  listen(media, "change", () => {
    if (reduced()) {
      view.stopFuse();
      reposition();
    }
  });
  if (win.visualViewport && !view.tracksAnchor) {
    listen(win.visualViewport, "resize", schedulePosition);
    listen(win.visualViewport, "scroll", schedulePosition);
  }
  for (const trigger of root.querySelectorAll<HTMLElement>("[data-tip]")) add(trigger);
  if (root.nodeType === 1 && (root as HTMLElement).hasAttribute("data-tip"))
    add(root as HTMLElement);

  return {
    add,
    show: (trigger: HTMLElement) => open(trigger),
    hide() {
      hovered = undefined;
      focused = undefined;
      dismiss();
    },
    update(input: Input) {
      if (destroyed) return;
      config = resolve(input, config, win);
      cancelOpen();
      view.overlay.className = `${view.baseClass} ${config.className}`.trim();
      reposition();
      if (active) observe(active);
    },
    reposition,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dismiss(true);
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      for (const entry of entries.values()) entry.cleanup();
      for (const remove of removers) remove();
      view.destroy();
    },
  };
}

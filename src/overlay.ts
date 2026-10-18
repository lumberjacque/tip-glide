/** Owns the top-layer host and delayed exit. Older browsers retain the body-mounted fallback. */
export function createOverlay(doc: Document, className: string) {
  const element = doc.createElement("div");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  const native = typeof element.showPopover === "function";
  if (native) element.setAttribute("popover", "manual");
  doc.body.append(element);
  let timer: number | undefined;
  const close = () => {
    if (native && element.matches(":popover-open")) element.hidePopover();
  };
  return {
    element,
    present(source?: HTMLElement) {
      // A body sibling stays inert while a modal is open; keep the host in its trigger's modal subtree.
      const parent = source?.closest("dialog:modal") ?? doc.body;
      if (element.parentElement !== parent) parent.append(element);
      doc.defaultView!.clearTimeout(timer);
      if (native && !element.matches(":popover-open")) element.showPopover();
    },
    conceal(delay = 0) {
      doc.defaultView!.clearTimeout(timer);
      if (delay) timer = doc.defaultView!.setTimeout(close, delay);
      else close();
    },
    destroy() {
      doc.defaultView!.clearTimeout(timer);
      element.remove();
    },
  };
}

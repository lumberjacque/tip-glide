import { createRichTipGlide, richContent } from "../rich.js";
import { resolveOptions } from "../options.js";
import type { TipGlideOptions } from "../types.js";

/** Declarative group configuration, shared by the optional framework adapters. @public */
export interface TipGlideAdapterOptions extends Omit<TipGlideOptions, "boundary"> {
  /** Use the group's own element as the boundary, or supply a same-document element. @defaultValue null */
  boundary?: HTMLElement | "root" | null;
  /** Show the first nonempty trigger on mount and when that trigger changes. Useful for touch previews. @defaultValue false */
  alwaysVisible?: boolean;
}

/** Internal DOM ownership shared by the adapters. Importing this module does not access browser globals. */
export function bindTipGlide(root: HTMLElement, input: TipGlideAdapterOptions = {}) {
  const normalize = (value: TipGlideAdapterOptions) => {
    const { boundary, alwaysVisible = false, ...options } = value;
    if (typeof alwaysVisible !== "boolean")
      throw new TypeError("tip-glide: invalid alwaysVisible.");
    return {
      options: resolveOptions({
        ...options,
        boundary: boundary === "root" ? root : (boundary ?? null),
      }),
      alwaysVisible,
    };
  };
  let config = normalize(input);
  const controller = createRichTipGlide(root, config.options);
  const entries = new Map<
    HTMLElement,
    { text: string; template: Element | null; remove: () => void }
  >();
  let destroyed = false,
    pinned: HTMLElement | undefined;
  const reconcile = () => {
    if (destroyed) return;
    const triggers = new Set<HTMLElement>(root.hasAttribute("data-tip") ? [root] : []);
    for (const trigger of root.querySelectorAll<HTMLElement>("[data-tip]")) triggers.add(trigger);
    for (const [trigger, entry] of entries) {
      if (!triggers.has(trigger) || !(trigger.getAttribute("data-tip") ?? "").trim()) {
        entry.remove();
        entries.delete(trigger);
        if (pinned === trigger) pinned = undefined;
      }
    }
    for (const trigger of triggers) {
      const text = trigger.getAttribute("data-tip") ?? "";
      const id = trigger.getAttribute("data-tip-template");
      const template = id ? root.ownerDocument.getElementById(id) : null;
      const old = entries.get(trigger);
      if (!text.trim() || (old?.text === text && old.template === template)) continue;
      if (id && (!template || template.tagName !== "TEMPLATE"))
        throw new TypeError(
          "tip-glide: data-tip-template must reference a same-document template.",
        );
      const content = template
        ? richContent(text, (host) => {
            host.append((template as HTMLTemplateElement).content.cloneNode(true));
          })
        : text;
      const entry = entries.get(trigger);
      if (entry) {
        controller.setContent(trigger, content);
        entry.text = text;
        entry.template = template;
      } else entries.set(trigger, { text, template, remove: controller.add(trigger, content) });
      if (pinned === trigger) pinned = undefined;
    }
    const first = Array.from(triggers).find((trigger) => entries.has(trigger));
    if (config.alwaysVisible && first && pinned !== first) {
      controller.show(first);
      pinned = first;
    }
  };
  reconcile();
  const Observer = root.ownerDocument.defaultView!.MutationObserver;
  const observer = new Observer(reconcile);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-tip", "data-tip-template"],
  });
  return {
    update(next: TipGlideAdapterOptions = {}) {
      if (destroyed) return;
      const resolved = normalize(next);
      const changed = (Object.keys(resolved.options) as (keyof TipGlideOptions)[]).some(
        (key) => resolved.options[key] !== config.options[key],
      );
      if (changed) controller.update(resolved.options);
      if (config.alwaysVisible && !resolved.alwaysVisible) {
        controller.hide();
        pinned = undefined;
      }
      config = resolved;
      reconcile();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      controller.destroy();
      entries.clear();
      pinned = undefined;
    },
  };
}

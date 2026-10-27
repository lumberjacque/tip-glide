import { createFullController } from "./controller.js";
import { createView } from "./view.js";
import { createScope } from "./scope.js";
import type { TipGlideScope } from "./scope.js";
import type { TipGlide, TipGlideOptions } from "./types.js";

const brand = Symbol("TipGlideContent");

/** A non-interactive visual renderer and its equivalent screen-reader description. @public */
export interface TipGlideRichContent {
  readonly [brand]: true;
  /** Plain-text equivalent, including any meaning conveyed by badges or icons. */
  readonly description: string;
  /** Mount into the supplied inert host; return cleanup for owned framework resources. */
  readonly render: (container: HTMLElement) => void | (() => void);
}

/** Text or opt-in rich content; empty text/null/false disables a scoped trigger. @public */
export type RichTooltipContent = string | TipGlideRichContent | null | undefined | false;

/**
 * Describe rich tooltip content without mounting it or accessing browser globals.
 * @param description - Required nonempty plain-text equivalent for aria-describedby.
 * @param source - A trusted DOM element or renderer returning an optional cleanup function.
 * @returns Content for a rich controller or framework trigger binding.
 * @throws If the description is empty or the source is neither an element nor a renderer.
 * @remarks HTML strings are never parsed. Renderers mount lazily on presentation and clean up
 * after exit, replacement or destruction. DOM elements are moved, then restored to their original
 * parent/sibling. Content is inert: links, buttons and other interactive controls require a popover.
 * @example `richContent('Pro plan', host => { host.append(document.createElement('strong')); })`
 * @public
 */
export function richContent(
  description: string,
  source: Element | TipGlideRichContent["render"],
): TipGlideRichContent {
  if (typeof description !== "string" || !description.trim())
    throw new TypeError("tip-glide: rich content requires a nonempty plain-text description.");
  if (typeof source !== "function" && (!source || source.nodeType !== 1))
    throw new TypeError("tip-glide: rich content requires a DOM element or renderer.");
  const render =
    typeof source === "function"
      ? source
      : (container: HTMLElement) => {
          if (source.ownerDocument !== container.ownerDocument || source.contains(container))
            throw new TypeError(
              "tip-glide: content must belong to the tooltip document and cannot contain its host.",
            );
          const parent = source.parentNode,
            next = source.nextSibling;
          container.append(source);
          return () => {
            if (parent) parent.insertBefore(source, next?.parentNode === parent ? next : null);
            else source.remove();
          };
        };
  return Object.freeze({ [brand]: true as const, description, render });
}

/** Identify content created by richContent without reading browser globals. @public */
export function isRichContent(value: unknown): value is TipGlideRichContent {
  return typeof value === "object" && value !== null && brand in value;
}

function contentDescription(value: string | TipGlideRichContent): string {
  if (typeof value === "string") return value;
  if (isRichContent(value)) return value.description;
  throw new TypeError("tip-glide: use plain text or richContent for tooltip content.");
}

/** Full geometric controller accepting text or richContent; base/native remain text-only. @public */
export interface RichTipGlide extends Omit<TipGlide, "add" | "setContent"> {
  /** Register content. Omission reads data-tip. Returns an idempotent unregister function. */
  add(trigger: HTMLElement, content?: string | TipGlideRichContent): () => void;
  /** Update content in place, retaining the accessible description ID. Empty text unregisters. */
  setContent(trigger: HTMLElement, content: string | TipGlideRichContent): void;
}

/**
 * Create an opt-in rich group with the full geometric renderer and connected liquid pointer.
 * @param root - Same-document trigger root; call after the browser body exists.
 * @param options - Standard full-renderer options. Import tip-glide/style.css once.
 * @returns A controller; destroy it when its owning view unmounts.
 * @remarks One active visual renderer is mounted per group, with no measurement clone. Reactive
 * dimensions are observed by the existing resize lifecycle. Plain-text/base/native entries do not
 * import this module. Visual content is aria-hidden and inert; descriptions remain per trigger.
 * @example `const tips = createRichTipGlide(document); tips.add(button, richContent('New', badge));`
 * @public
 */
export function createRichTipGlide(
  root: Document | HTMLElement,
  options: TipGlideOptions = {},
): RichTipGlide {
  const contents = new WeakMap<HTMLElement, string | TipGlideRichContent>();
  let mounted: TipGlideRichContent | undefined, target: HTMLElement | undefined;
  let cleanup: (() => void) | undefined;
  const clear = () => {
    const dispose = cleanup;
    cleanup = undefined;
    mounted = undefined;
    const old = target;
    target = undefined;
    try {
      dispose?.();
    } finally {
      old?.remove();
    }
  };
  const controller = createFullController(root, options, (doc, win) =>
    createView(doc, win, {
      clear,
      present(trigger, container) {
        const value = contents.get(trigger);
        if (!isRichContent(value)) {
          clear();
          return false;
        }
        if (mounted?.render === value.render && target) return true;
        clear();
        const host = doc.createElement("div");
        host.inert = true;
        host.className = "tg-rich-content";
        container.replaceChildren(host);
        target = host;
        mounted = value;
        try {
          cleanup = value.render(host) || undefined;
        } catch (error) {
          clear();
          throw error;
        }
        return true;
      },
    }),
  );
  const registered = new WeakMap<HTMLElement, () => void>();
  return {
    ...controller,
    add(trigger, value = trigger.getAttribute("data-tip") ?? "") {
      const text = contentDescription(value);
      contents.set(trigger, value);
      const remove = controller.add(trigger, text);
      const unregister = () => {
        if (registered.get(trigger) !== unregister) return;
        remove();
        contents.delete(trigger);
        registered.delete(trigger);
      };
      registered.set(trigger, unregister);
      return unregister;
    },
    setContent(trigger, value) {
      const text = contentDescription(value);
      if (!registered.has(trigger)) return;
      contents.set(trigger, value);
      controller.setContent(trigger, text);
      if (!text.trim()) {
        contents.delete(trigger);
        registered.delete(trigger);
      }
    },
  };
}

/**
 * Create centrally configured rich tooltip bindings, without mounting browser resources.
 * @param options - Shared full-renderer defaults; each document lazily owns one surface.
 * @returns A scope accepting text and richContent. Null/false/empty text disables a trigger.
 * @remarks Create per app/request, not as mutable global state. Destroy registrations on unmount.
 * @example `const app = createRichTipGlideScope({ lean: true }); app.attach(button, richContent('Pro', badge));`
 * @public
 */
export function createRichTipGlideScope(
  options: TipGlideOptions = {},
): TipGlideScope<string | TipGlideRichContent> {
  return createScope(options, createRichTipGlide, contentDescription);
}

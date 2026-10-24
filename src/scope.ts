import { createTipGlide } from "./controller.js";
import { resolveOptions } from "./options.js";
import type { TipGlide, TipGlideOptions } from "./types.js";

/** Plain tooltip text; empty, null, undefined and false disable the trigger. @public */
export type TipGlideContent = string | null | undefined | false;

/** A trigger's ownership within its application scope. @public */
export interface TipGlideTrigger<Content = string> {
  /** Replace reactive text; empty content disables the tooltip without removing the element. */
  update(content: Content | null | undefined | false): void;
  /** Unregister this trigger. Repeated cleanup is harmless. */
  destroy(): void;
}

/** Central configuration and one shared tooltip per document while triggers are registered. @public */
export interface TipGlideScope<Content = string> {
  /** Attach an element after mount. Import the full stylesheet once in the application. */
  attach(
    element: HTMLElement,
    content: Content | null | undefined | false,
  ): TipGlideTrigger<Content>;
  /** Replace the central configuration. Omitted fields reset to core defaults; invalid values throw. */
  configure(options?: TipGlideOptions): void;
  /** Release all current bindings and resources. A later attachment starts a fresh group. */
  destroy(): void;
}

/**
 * Create an application-local configuration scope without reading browser globals.
 * @param options - Central full-renderer options, including lean and warmDuration.
 * @returns A lazy scope. Each attachment owns its cleanup; the final trigger releases its document group.
 * @throws Invalid options throw before replacing existing configuration; non-text content throws on attachment/update.
 * @remarks Create one scope per application/provider, never as a mutable server-side singleton.
 * No DOM, observers or listeners are created before a nonempty trigger attaches. Portal triggers can share
 * their provider's scope. Different documents get separate visual surfaces. Empty text disables a trigger.
 * Browser-only custom-keyframe validation runs when a document group first attaches.
 * @example
 * ```ts
 * const scope = createTipGlideScope({ lean: true, warmDuration: 800 });
 * const trigger = scope.attach(button, 'Save changes');
 * trigger.update('Saved');
 * trigger.destroy();
 * ```
 * @public
 */
export function createTipGlideScope(options: TipGlideOptions = {}): TipGlideScope {
  return createScope(options, createTipGlide, (content) => {
    if (typeof content !== "string")
      throw new TypeError("tip-glide: tooltip content must be plain text.");
    return content;
  });
}

/** Internal scope ownership, reused without importing rich rendering in the text entry. */
export function createScope<Content>(
  options: TipGlideOptions,
  factory: (
    root: HTMLElement,
    options: TipGlideOptions,
  ) => Pick<TipGlide, "update" | "destroy"> & {
    add(element: HTMLElement, content: Content): () => void;
    setContent(element: HTMLElement, content: Content): void;
  },
  description: (content: Content) => string,
): TipGlideScope<Content> {
  let config = resolveOptions(options);
  const groups = new Map<Document, { tips: ReturnType<typeof factory>; count: number }>();
  const bindings = new Set<TipGlideTrigger<Content>>();
  return {
    configure(next = {}) {
      const resolved = resolveOptions(next);
      if (
        Object.keys(resolved).every(
          (key) => resolved[key as keyof typeof resolved] === config[key as keyof typeof config],
        )
      )
        return;
      // Check boundary ownership before updating document groups.
      for (const doc of groups.keys()) {
        if (resolved.boundary && resolved.boundary.ownerDocument !== doc)
          throw new TypeError("tip-glide: scope boundary must share its triggers' document.");
      }
      for (const group of groups.values()) group.tips.update(resolved);
      config = resolved;
    },
    attach(element, initial) {
      let group: { tips: ReturnType<typeof factory>; count: number } | undefined;
      let unregister: (() => void) | undefined;
      let previous: Content | null | undefined | false;
      let destroyed = false;
      function release() {
        unregister?.();
        unregister = undefined;
        if (group && !--group.count) {
          group.tips.destroy();
          groups.delete(element.ownerDocument);
        }
        group = undefined;
      }
      const binding: TipGlideTrigger<Content> = {
        update(content) {
          if (destroyed) return;
          const empty = content === null || content === undefined || content === false;
          const text = empty ? "" : description(content as Content);
          if (content === previous) return;
          if (!text.trim()) {
            release();
            previous = content;
            return;
          }
          if (!group) {
            const doc = element.ownerDocument;
            group = groups.get(doc);
            if (!group) {
              group = { tips: factory(doc.createElement("div"), config), count: 0 };
              groups.set(doc, group);
            }
            unregister = group.tips.add(element, content as Content);
            group.count++;
          } else group.tips.setContent(element, content as Content);
          previous = content;
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          release();
          bindings.delete(binding);
        },
      };
      binding.update(initial);
      bindings.add(binding);
      return binding;
    },
    destroy() {
      for (const binding of bindings) binding.destroy();
    },
  };
}

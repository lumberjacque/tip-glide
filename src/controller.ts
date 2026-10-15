import { resolveOptions } from "./options.js";
import { createController } from "./lifecycle.js";
import { createView } from "./view.js";
import type { TipGlide, TipGlideOptions } from "./types.js";

/**
 * Create a group and register its initial `[data-tip]` descendants.
 *
 * @param root - A document or element containing the initial triggers. Call after its document body exists.
 * @param options - Group configuration. Import `tip-glide/style.css` separately.
 * @returns A controller. Call `destroy()` when the owning view unmounts.
 * @throws If the root has no browser window or document body, or options are invalid.
 * @remarks
 * No browser globals are read during module import, so importing from an SSR module is safe.
 * Creation itself is browser-only. Later DOM additions use `add()`; descriptions are plain text.
 * Native focus outlines and accessible names are never replaced.
 * @example
 * ```ts
 * import { createTipGlide } from 'tip-glide';
 * import 'tip-glide/style.css';
 * const tips = createTipGlide(document, { lean: true, showFuse: true });
 * // On unmount:
 * tips.destroy();
 * ```
 * @public
 */
export function createTipGlide(
  root: Document | HTMLElement,
  options: TipGlideOptions = {},
): TipGlide {
  return createController(
    root,
    options,
    (input, previous, win) => {
      const config = resolveOptions(input, previous);
      if (config.boundary && config.boundary.ownerDocument !== win.document)
        throw new TypeError("tip-glide: boundary must belong to the root's document.");
      for (const effect of [config.enter, config.exit]) {
        if (typeof effect === "object" && typeof win.KeyframeEffect === "function")
          // oxlint-disable-next-line no-new -- Validate timing and keyframes without playing an animation.
          new win.KeyframeEffect(null, effect.keyframes, {
            duration: effect.duration ?? 180,
            easing: effect.easing ?? "linear",
          });
      }
      return config;
    },
    createView,
  );
}

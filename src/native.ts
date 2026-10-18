import { createController } from "./lifecycle.js";
import { resolveBaseOptions } from "./base-options.js";
import { createNativeView } from "./native-view.js";
import type { TipGlideBase, TipGlideBaseOptions } from "./base.js";

/** Native cardinal placement and opacity fades. No geometric travel, arrow, lean or size morphing. @public */
export type TipGlideNativeOptions = Omit<TipGlideBaseOptions, "duration">;

/** Native lifecycle controller. @public */
export interface TipGlideNative extends Omit<TipGlideBase, "update"> {
  /** Apply native configuration without replacing the group. */
  update(options: TipGlideNativeOptions): void;
}

/**
 * Test CSS anchor placement and the Popover API in a browser window.
 * @param win - Target window; omitted on the server returns false.
 * @returns Whether the native entry can be created. Import the base entry as an explicit fallback.
 * @public
 */
export function supportsNativeTipGlide(
  win = typeof window === "undefined" ? undefined : window,
): boolean {
  return (
    !!win &&
    typeof win.HTMLElement.prototype.showPopover === "function" &&
    win.CSS?.supports("position-area", "top") &&
    win.CSS.supports("position-try-fallbacks", "flip-block")
  );
}

/**
 * Create a CSS-positioned tooltip group in the top layer.
 * @param root - Document or container of initial `[data-tip]` triggers.
 * @param options - Native configuration. Import `tip-glide/native.css` separately.
 * @returns The shared lifecycle API; destroy on unmount.
 * @throws When native placement is unavailable or configuration is invalid.
 * @remarks No JS layout measurements or animation loop. CSS owns cardinal placement,
 * viewport fallback, content sizing and fades. Use the root entry for geometric motion.
 * Import is SSR-safe; creation requires a browser with a document body.
 * @public
 */
export function createTipGlide(
  root: Document | HTMLElement,
  options: TipGlideNativeOptions = {},
): TipGlideNative {
  const doc = root.nodeType === 9 ? (root as Document) : (root as HTMLElement).ownerDocument;
  if (!supportsNativeTipGlide(doc.defaultView ?? undefined))
    throw new Error("tip-glide: native placement unavailable; use tip-glide/base.");
  return createController(root, options, resolveBaseOptions, createNativeView);
}

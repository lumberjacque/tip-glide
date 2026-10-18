import { createController } from "./lifecycle.js";
import { createBaseView } from "./base-view.js";
import { resolveBaseOptions } from "./base-options.js";
import type { TipGlide, TipGlideOptions } from "./types.js";

/**
 * Lightweight configuration. Uses the same defaults as the full entry.
 * Travel is direct, with a fixed fade on entry/exit and no pointer, lean or fuse.
 * @public
 */
export type TipGlideBaseOptions = Pick<
  TipGlideOptions,
  | "touch"
  | "hideOnDrag"
  | "gap"
  | "viewportPadding"
  | "openDelay"
  | "closeDelay"
  | "warmDuration"
  | "duration"
  | "motion"
  | "className"
> & {
  /** Preferred side. Flips to its opposite when space permits, then clamps to the viewport. @defaultValue 'top' */
  placement?: "top" | "right" | "bottom" | "left";
};

/** The shared lifecycle API, accepting only the lightweight configuration. @public */
export interface TipGlideBase extends Omit<TipGlide, "update"> {
  /** Apply partial lightweight configuration; invalid values throw before changing the active tooltip. */
  update(options: TipGlideBaseOptions): void;
}

/**
 * Create a lightweight group with one shared visual tooltip, size morphing and viewport placement.
 * @param root - Document or element containing initial `[data-tip]` triggers; its body must exist.
 * @param options - Lightweight configuration. Import `tip-glide/base.css` separately.
 * @returns The lifecycle controller; call `destroy()` on unmount.
 * @throws If the root has no browser window/body or an option is invalid.
 * @remarks Import is SSR-safe; creation is browser-only. Keyboard focus and reduced motion are instant.
 * Use the root entry for liquid arrows, lean, fuse, custom transitions or 360° routing.
 * @public
 */
export function createTipGlide(
  root: Document | HTMLElement,
  options: TipGlideBaseOptions = {},
): TipGlideBase {
  return createController(root, options, resolveBaseOptions, createBaseView);
}

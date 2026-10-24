import type { Rect } from "./geometry.js";
import type { TipGlideOptions } from "./types.js";

// Shared input, accessibility and teardown; renderers own the visual feature set.
export type ControllerOptions = Required<
  Pick<
    TipGlideOptions,
    | "boundary"
    | "motion"
    | "className"
    | "openDelay"
    | "closeDelay"
    | "warmDuration"
    | "touch"
    | "hideOnDrag"
  >
>;
export interface ControllerView<Config> {
  /** Native renderers track the anchor through CSS, without JS positioning. */
  tracksAnchor?: boolean;
  /** Intrinsic rich-content changes may morph the surface instead of snapping. */
  animatedContent?: boolean;
  baseClass: string;
  overlay: HTMLElement;
  position: HTMLElement;
  measurement: HTMLElement;
  bounds(options: Config): Rect;
  render(
    trigger: HTMLElement,
    text: string,
    options: Config,
    instant: boolean,
    changed: boolean,
  ): string;
  hide(instant: boolean): void;
  startFuse(
    trigger: HTMLElement,
    text: string,
    delay: number,
    options: Config,
    reduced: boolean,
  ): void;
  stopFuse(): void;
  destroy(): void;
}

/** Optional full-renderer seam; framework ownership stays outside geometry and input handling. */
export interface ContentPresentation {
  present(trigger: HTMLElement, container: HTMLElement): boolean;
  clear(): void;
}

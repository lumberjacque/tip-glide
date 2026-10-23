/** A preferred side or angle in degrees. 0 above, 90 right, 180 below, 270 left; wraps at 360. Falls back when space is limited. @public */
export type Placement = "top" | "bottom" | "left" | "right" | number;

/** Custom motion on the tooltip's entrance/exit layer. Never transforms the text resize layer. @public */
export interface TipAnimation {
  /** Web Animations keyframes. At least two frames; use opacity and transform for smooth motion. */
  keyframes: Keyframe[];
  /** Duration in milliseconds. Defaults to 180 on entry and 140 on exit. */
  duration?: number;
  /** A CSS easing string. Defaults to a strong ease-out. */
  easing?: string;
}

/** Entrance/exit preset or custom Web Animations configuration. @public */
export type TipTransition = "scale" | "fade" | "slide" | "none" | TipAnimation;

/** Motion policy. `system` follows live changes to prefers-reduced-motion. @public */
export type MotionPreference = "system" | "reduced";

/** Configuration for one group of tooltips. All distances are CSS pixels. @public */
export interface TipGlideOptions {
  /** Opt-in tap toggling for dedicated information triggers. Does not prevent their normal click action. @defaultValue 'none' */
  touch?: "none" | "tap";
  /** Dismiss after a primary pointer moves more than 6 CSS pixels, or a native drag starts. Disable for positioning demos. @defaultValue true */
  hideOnDrag?: boolean;
  /** Preferred side or angle in degrees: 0 above, 90 right, 180 below, 270 left. Wraps at 360. @defaultValue 'top' */
  placement?: Placement;
  /** Confine the tooltip to this element's client box intersected with the viewport. Must share the root's document. @defaultValue null */
  boundary?: HTMLElement | null;
  /** Draw a small pointer toward the trigger. @defaultValue false */
  arrow?: boolean;
  /** Pointer blend: 0 is geometric, 1 has a wider rounded liquid neck. @defaultValue 0.7 */
  arrowBlend?: number;
  /** Entrance animation. Keyboard focus and reduced motion skip all animations. @defaultValue 'scale' */
  enter?: TipTransition;
  /** Exit animation. Reduced motion and Escape dismiss instantly. @defaultValue 'scale' */
  exit?: TipTransition;
  /** Distance between trigger and tooltip. @defaultValue 12 */
  gap?: number;
  /** Minimum distance from the effective boundary edges. @defaultValue 12 */
  viewportPadding?: number;
  /** Delay in milliseconds for the first pointer hover. Focus opens immediately. @defaultValue 400 */
  openDelay?: number;
  /** Grace period in milliseconds to cross a gap between triggers or reach the tooltip. @defaultValue 120 */
  closeDelay?: number;
  /** Time in milliseconds after closing during which another hover skips the opening delay. @defaultValue 600 */
  warmDuration?: number;
  /** Travel and size morph duration in milliseconds. Focus and reduced motion are always instant. @defaultValue 180 */
  duration?: number;
  /** Subtle directional tilt during a glide. @defaultValue true */
  lean?: boolean;
  /** Display a progress line on the trigger edge facing the resolved tooltip during the initial delay. @defaultValue false */
  showFuse?: boolean;
  /** Respect system settings, or explicitly remove spatial animation. @defaultValue 'system' */
  motion?: MotionPreference;
  /** Additional class on the body-mounted overlay, for CSS variable theming. @defaultValue '' */
  className?: string;
}

/** A group owns one visual tooltip and a stable accessible description per trigger. @public */
export interface TipGlide {
  /**
   * Register a trigger, or replace its description if already registered.
   * @param trigger - An element in the same document as the group's root.
   * @param text - Plain text; defaults to the element's `data-tip` attribute.
   * @returns An idempotent unregister function. Old cleanup functions cannot remove a newer registration.
   * @throws If the trigger belongs to another document.
   */
  add(trigger: HTMLElement, text?: string): () => void;
  /**
   * Show a registered trigger immediately. Does not move keyboard focus.
   * @param trigger - The registered trigger to show. Unregistered triggers are ignored.
   */
  show(trigger: HTMLElement): void;
  /**
   * Update a registered trigger's plain-text description without closing its visible tooltip.
   * Empty text unregisters the trigger; unknown triggers are ignored.
   * @param trigger - A trigger registered with this group.
   * @param text - The new plain-text description.
   */
  setContent(trigger: HTMLElement, text: string): void;

  /** Dismiss and cancel pending opening. Remains dismissed until a new hover, focus or explicit show. */
  hide(): void;
  /**
   * Apply partial configuration. Repositions an open tooltip and cancels a pending opening.
   * @param options - Fields to replace. Omitted fields keep their current value.
   * @throws If configuration is invalid or the boundary belongs to another document.
   */
  update(options: TipGlideOptions): void;
  /** Re-measure the active trigger after an application-driven layout change. */
  reposition(): void;
  /** Remove descriptions, listeners, observers, timers and overlay. Safe to call more than once. */
  destroy(): void;
}

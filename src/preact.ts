import { createContext, h } from "preact";
import type { ComponentChildren, JSX, RefCallback } from "preact";
import { useCallback, useContext, useEffect, useRef } from "preact/hooks";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import { createTipGlideScope } from "./scope.js";
import type { TipGlideScope, TipGlideContent, TipGlideTrigger } from "./scope.js";
import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
/**
 * Preact callback ref owning a shared tooltip group.
 * @param options - Full configuration, applied after commit. Omitted fields reset to defaults.
 * @returns A stable native-element ref. Ref replacement and unmount release all owned resources.
 * @throws Core validation errors during mount or an update.
 * @remarks Importing and server-rendering are safe; browser work starts when the ref mounts.
 * @example
 * ```tsx
 * const ref = useTipGlide({ lean: true });
 * return <div ref={ref}><button data-tip="Save">Save</button></div>;
 * ```
 * @public
 */
export function useTipGlide<T extends HTMLElement = HTMLDivElement>(
  options: TipGlideAdapterOptions = {},
): RefCallback<T> {
  const binding = useRef<ReturnType<typeof bindTipGlide> | undefined>(undefined);
  const committed = useRef(options);
  const ref = useCallback((element: T | null) => {
    binding.current?.destroy();
    binding.current = element ? bindTipGlide(element, committed.current) : undefined;
  }, []);
  useEffect(() => {
    committed.current = options;
    binding.current?.update(options);
  }, [options]);
  return ref;
}

/** Native div attributes and full group configuration for the Preact wrapper. @public */
export interface TipGlideProps extends Omit<JSX.IntrinsicElements["div"], "ref" | "children"> {
  /** Reactive options. Import the stylesheet once in your application. @defaultValue undefined */
  options?: TipGlideAdapterOptions;
  /** `data-tip` descendants are registered automatically, including conditional children. */
  children?: ComponentChildren;
}

/**
 * Preact group wrapper with automatic registration, updates and cleanup.
 * @param props - Native div attributes, optional options and trigger children.
 * @returns A div owning one tooltip group, safe to server-render.
 * @example
 * ```tsx
 * <TipGlide options={{ arrow: true }}><button data-tip="Save">Save</button></TipGlide>
 * ```
 * @public
 */
export function TipGlide({ options, children, ...attributes }: TipGlideProps) {
  const ref = useTipGlide(options);
  return h("div", { ...attributes, ref }, children);
}

const ScopeContext = /* @__PURE__ */ createContext<TipGlideScope | null>(null);

/** Application provider props; no wrapper element is added. @public */
export interface TipGlideProviderProps {
  /** Central configuration. Omitted values reset to defaults on update. */
  options?: TipGlideOptions;
  /** Application content; tooltip refs share this provider's scope, including portals. */
  children?: ComponentChildren;
}

/**
 * Configure tooltips once around the application; renders no extra DOM.
 * @param props - Central options and application content.
 * @returns The context provider. Browser resources are lazy and released with the final trigger.
 * @remarks The context value has stable identity. Scopes are per provider/request; no DOM work runs
 * during import or server rendering. Import the stylesheet once globally.
 * @example `<TipGlideProvider options={{ lean: true, warmDuration: 800 }}><App /></TipGlideProvider>`
 * @public
 */
export function TipGlideProvider({ options = {}, children }: TipGlideProviderProps) {
  const scope = useRef<TipGlideScope | undefined>(undefined);
  if (!scope.current) scope.current = createTipGlideScope(options);
  const current = scope.current;
  useEffect(() => current.configure(options), [current, options]);
  return h(ScopeContext.Provider, { value: current }, children);
}

/**
 * Attach reactive tooltip text to an existing element within TipGlideProvider.
 * @param content - Plain text; empty/null/false disables the tooltip.
 * @returns A stable element ref, with automatic registration, live text updates and cleanup.
 * @throws When used outside a provider, or content/options are invalid.
 * @remarks Call unconditionally at component top level; pass null to disable. No per-trigger group
 * or manual lifecycle effect is needed. Imports and SSR are safe. Custom button components must
 * forward this ref to a native element; compose it with any other ref the element needs.
 * @example `const tip = useTooltip('Save changes'); return <button ref={tip}>Save</button>;`
 * @public
 */
export function useTooltip<T extends HTMLElement = HTMLElement>(
  content: TipGlideContent,
): RefCallback<T> {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("tip-glide: useTooltip requires TipGlideProvider.");
  const binding = useRef<TipGlideTrigger | undefined>(undefined);
  const committed = useRef(content);
  const ref = useCallback(
    (element: T | null) => {
      binding.current?.destroy();
      binding.current = element ? scope.attach(element, committed.current) : undefined;
    },
    [scope],
  );
  useEffect(() => {
    committed.current = content;
    binding.current?.update(content);
  }, [content]);
  return ref;
}

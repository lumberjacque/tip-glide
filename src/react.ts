"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  Fragment,
} from "react";
import { createPortal } from "react-dom";
import type { HTMLAttributes, ReactNode, RefCallback } from "react";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import { createRichTipGlideScope as createTipGlideScope, richContent } from "./rich.js";
import type { TipGlideRichContent } from "./rich.js";
import type { TipGlideContent } from "./scope.js";
type TipGlideScope = ReturnType<typeof createTipGlideScope>;
type TipGlideTrigger = ReturnType<TipGlideScope["attach"]>;
import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
export { richContent } from "./rich.js";
export type { TipGlideRichContent } from "./rich.js";
/**
 * Attach one shared tooltip to an existing element with a stable callback ref.
 * @param options - Full configuration; omitted fields reset to defaults. Changes apply after commit.
 * @returns A ref for the group element. Mount, ref replacement, Strict Mode replay and unmount own cleanup.
 * @throws Invalid options produce the same errors as the core, during mount or an update.
 * @example
 * ```tsx
 * const ref = useTipGlide({ arrow: true });
 * return <nav ref={ref}><button data-tip="Save this">Save</button></nav>;
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

/** Props for the React group wrapper. Native div attributes pass through unchanged. @public */
export interface TipGlideProps extends HTMLAttributes<HTMLDivElement> {
  /** Full reactive group configuration. Import the stylesheet once in your application. */
  options?: TipGlideAdapterOptions;
  /** Elements with `data-tip` participate in the shared tooltip, including children added later. */
  children?: ReactNode;
}

/**
 * A div-backed tooltip group with automatic registration, updates and cleanup.
 * @param props - Native div attributes, children and optional tooltip options.
 * @returns The group element. Safe to server-render; browser work starts when its ref mounts.
 * @example
 * ```tsx
 * <TipGlide options={{ lean: true }}><button data-tip="Copy a link">Link</button></TipGlide>
 * ```
 * @public
 */
export function TipGlide({ options, children, ...attributes }: TipGlideProps) {
  const ref = useTipGlide(options);
  return createElement("div", { ...attributes, ref }, children);
}

const ScopeContext = /* @__PURE__ */ createContext<TipGlideScope | null>(null);

/** Application provider props; no wrapper element is added. @public */
export interface TipGlideProviderProps {
  /** Central configuration. Omitted values reset to defaults on update. */
  options?: TipGlideOptions;
  /** Application content; tooltip refs share this provider's scope, including portals. */
  children?: ReactNode;
}

/**
 * Configure tooltips once around the application; renders no extra DOM.
 * @param props - Central options and application content.
 * @returns The context provider. Browser resources are lazy and released with the final trigger.
 * @remarks The context value has stable identity. Scopes are per provider/request; no DOM work runs
 * during import or server rendering. In React Server Component applications, use a client provider
 * wrapper and keep the surrounding layout server-rendered. Import the stylesheet once globally.
 * @example `<TipGlideProvider options={{ lean: true, warmDuration: 800 }}><App /></TipGlideProvider>`
 * @public
 */
export function TipGlideProvider({ options = {}, children }: TipGlideProviderProps) {
  const scope = useRef<TipGlideScope | undefined>(undefined);
  if (!scope.current) scope.current = createTipGlideScope(options);
  const current = scope.current;
  useEffect(() => current.configure(options), [current, options]);
  return createElement(ScopeContext.Provider, { value: current }, children);
}

/**
 * Attach reactive tooltip content to an existing element within TipGlideProvider.
 * @param content - Plain text or richContent; empty/null/false disables the tooltip.
 * @returns A stable element ref, with automatic registration, live text updates and cleanup.
 * @throws When used outside a provider, or content/options are invalid.
 * @remarks Call unconditionally at component top level; pass null to disable. No per-trigger group
 * or manual lifecycle effect is needed. Imports and SSR are safe. Custom button components must
 * forward this ref to a native element; compose it with any other ref the element needs.
 * @example `const tip = useTooltip('Save changes'); return <button ref={tip}>Save</button>;`
 * @public
 */
export function useTooltip<T extends HTMLElement = HTMLElement>(
  content: TipGlideContent | TipGlideRichContent,
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

/** Props for an opt-in rich tooltip rendered through the caller's React context. @public */
export interface TooltipProps {
  /** Non-interactive JSX, such as badges, icons and emphasized text. */
  content: ReactNode;
  /** Required equivalent plain-text accessible description. */
  description: string;
  /** Render the native trigger and forward the supplied stable ref to it. */
  children: (ref: RefCallback<HTMLElement>) => ReactNode;
}

/**
 * Render rich JSX through a portal, preserving the consumer's providers and component state.
 * @param props - JSX content, accessible description and a trigger render function.
 * @returns Trigger content and a lazy tooltip portal; no extra trigger wrapper is created.
 * @remarks Requires TipGlideProvider. SSR renders only the trigger. Content is inert and mounts
 * on presentation, remaining mounted through reactive updates until exit/replacement/unmount.
 * @example `<Tooltip description="Pro plan" content={<strong>Pro</strong>}>{ref => <button ref={ref}>Plan</button>}</Tooltip>`
 * @public
 */
export function Tooltip({ content, description, children }: TooltipProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const render = useCallback((host: HTMLElement) => {
    setTarget(host);
    return () => setTarget(null);
  }, []);
  const value = useMemo(() => richContent(description, render), [description, render]);
  const ref = useTooltip(value);
  return createElement(
    Fragment,
    null,
    children(ref),
    target ? createPortal(content, target) : null,
  );
}

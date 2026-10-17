"use client";

import { createElement, useCallback, useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode, RefCallback } from "react";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

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

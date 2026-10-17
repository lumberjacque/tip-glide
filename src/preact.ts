import { h } from "preact";
import type { ComponentChildren, JSX, RefCallback } from "preact";
import { useCallback, useEffect, useRef } from "preact/hooks";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

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

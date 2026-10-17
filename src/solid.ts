import { createEffect, onCleanup, onMount } from "solid-js";
import type { Accessor } from "solid-js";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

/**
 * Create a ref callback in a Solid component's owner. No consumer lifecycle hooks are needed.
 * @param options - Reactive accessor returning the full configuration. Omitted fields reset to defaults.
 * @returns A callback for a native element's `ref`. Updates follow the accessor; owner disposal releases the group.
 * @throws Core validation errors on mount or reactive updates.
 * @remarks Safe to render on the server: setup runs in `onMount` only. Call once during component setup.
 * @example
 * ```tsx
 * const ref = createTipGlideRef(() => ({ lean: enabled() }));
 * return <nav ref={ref}><button data-tip="Save">Save</button></nav>;
 * ```
 * @public
 */
export function createTipGlideRef<T extends HTMLElement = HTMLDivElement>(
  options: Accessor<TipGlideAdapterOptions | undefined> = () => undefined,
): (element: T) => void {
  let element: T | undefined;
  let binding: ReturnType<typeof bindTipGlide> | undefined;
  let mounted = false;
  onMount(() => {
    mounted = true;
    if (element) binding = bindTipGlide(element, options());
  });
  createEffect(() => {
    const next = options();
    binding?.update(next);
  });
  onCleanup(() => {
    binding?.destroy();
    binding = undefined;
    mounted = false;
  });
  return (next) => {
    if (next === element) return;
    binding?.destroy();
    binding = undefined;
    element = next;
    if (mounted) binding = bindTipGlide(next, options());
  };
}

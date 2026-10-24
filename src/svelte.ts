import type { Action } from "svelte/action";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import { getContext, setContext, onDestroy } from "svelte";
import { createRichTipGlideScope as createTipGlideScope } from "./rich.js";
import type { TipGlideRichContent } from "./rich.js";
import type { TipGlideContent } from "./scope.js";
type TipGlideScope = ReturnType<typeof createTipGlideScope>;

import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
export { richContent } from "./rich.js";
export type { TipGlideRichContent } from "./rich.js";
/**
 * Svelte action for a group of `data-tip` triggers, including children added later.
 * @param node - The native group element, supplied by Svelte after mounting.
 * @param options - Full reactive configuration; omitted fields reset to defaults.
 * @returns Action lifecycle methods: `update` applies options and `destroy` removes all owned resources.
 * @throws The same validation errors as the core, during mount or an update.
 * @remarks Svelte actions do not execute on the server. Supports Svelte 4 and 5.
 * @example
 * ```svelte
 * <script lang="ts">import { tipGlide } from 'tip-glide/svelte';</script>
 * <div use:tipGlide={{ arrow: true }}><button data-tip="Save this">Save</button></div>
 * ```
 * @public
 */
export const tipGlide: Action<HTMLElement, TipGlideAdapterOptions | undefined> = (node, options) =>
  bindTipGlide(node, options);

const SCOPE = Symbol("TipGlideScope");

/**
 * Provide central Svelte tooltip configuration during layout/root component initialization.
 * @param options - Application defaults, including lean and warmDuration.
 * @returns The scope, for optional central configure calls. Cleanup is owned by the component.
 * @remarks Call during component initialization, once per application/provider. Imports and SSR are safe.
 * @example `provideTipGlide({ lean: true, warmDuration: 800 });`
 * @public
 */
export function provideTipGlide(options: TipGlideOptions = {}): TipGlideScope {
  const scope = createTipGlideScope(options);
  setContext(SCOPE, scope);
  onDestroy(() => scope.destroy());
  return scope;
}

/**
 * Read the nearest provider and create a text-only tooltip action.
 * @returns An action with automatic registration, reactive text updates and teardown.
 * @throws When called without provideTipGlide in a parent component.
 * @remarks Call once during component initialization. Use the returned action on any number of elements.
 * @example `const tooltip = useTooltip();` then `<button use:tooltip={message}>Save</button>`.
 * @public
 */
export function useTooltip(): Action<HTMLElement, TipGlideContent | TipGlideRichContent> {
  const scope = getContext<TipGlideScope | undefined>(SCOPE);
  if (!scope)
    throw new Error("tip-glide: useTooltip requires provideTipGlide in a parent component.");
  return (element, content) => scope.attach(element, content);
}

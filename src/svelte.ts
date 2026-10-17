import type { Action } from "svelte/action";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

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

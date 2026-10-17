import type { ObjectDirective } from "vue";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

const groups = new WeakMap<HTMLElement, ReturnType<typeof bindTipGlide>>();

/**
 * Vue 3 directive for a group of `data-tip` triggers. Owns reactive options, dynamic children and cleanup.
 * @remarks Import as `vTipGlide` in script setup, then use `v-tip-glide="options"` on a native element.
 * Options are a full configuration; omitted fields reset to defaults. Mount/update can throw core validation errors.
 * No browser work runs during SSR. `unmounted` disconnects observers and destroys the group.
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { vTipGlide } from 'tip-glide/vue';
 * </script>
 * <template><div v-tip-glide="{ arrow: true }"><button data-tip="Save this">Save</button></div></template>
 * ```
 * @public
 */
export const vTipGlide: ObjectDirective<HTMLElement, TipGlideAdapterOptions | undefined> = {
  mounted(element, binding) {
    groups.get(element)?.destroy();
    groups.set(element, bindTipGlide(element, binding.value));
  },
  updated(element, binding) {
    groups.get(element)?.update(binding.value);
  },
  unmounted(element) {
    groups.get(element)?.destroy();
    groups.delete(element);
  },
};

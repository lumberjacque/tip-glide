import type { App, ObjectDirective, Plugin } from "vue";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import { createTipGlideScope } from "./scope.js";
import type { TipGlideContent, TipGlideScope, TipGlideTrigger } from "./scope.js";
import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
const applications = new WeakMap<App, TipGlideScope>();
type Value = TipGlideContent | TipGlideAdapterOptions;
function directive(fixed?: TipGlideScope): ObjectDirective<HTMLElement, Value> {
  const entries = new WeakMap<
    HTMLElement,
    { group: boolean; binding: TipGlideTrigger | ReturnType<typeof bindTipGlide> }
  >();
  const bind = (element: HTMLElement, value: Value, scope: TipGlideScope | undefined) => {
    const group = (typeof value === "object" && value !== null) || (value === undefined && !scope);
    if (!group && !scope)
      throw new Error("tip-glide: install createTipGlidePlugin before using text directives.");
    return {
      group,
      binding: group
        ? bindTipGlide(element, value as TipGlideAdapterOptions | undefined)
        : scope!.attach(element, value as TipGlideContent),
    };
  };
  return {
    mounted(element, binding) {
      const app = binding.instance?.$.appContext.app;
      entries.set(
        element,
        bind(element, binding.value, fixed ?? (app ? applications.get(app) : undefined)),
      );
    },
    updated(element, binding) {
      const old = entries.get(element);
      const app = binding.instance?.$.appContext.app;
      const scope = fixed ?? (app ? applications.get(app) : undefined);
      const group =
        (typeof binding.value === "object" && binding.value !== null) ||
        (binding.value === undefined && !scope);
      if (!old || old.group !== group) {
        old?.binding.destroy();
        entries.set(element, bind(element, binding.value, scope));
      } else if (group)
        (old.binding as ReturnType<typeof bindTipGlide>).update(
          binding.value as TipGlideAdapterOptions | undefined,
        );
      else (old.binding as TipGlideTrigger).update(binding.value as TipGlideContent);
    },
    unmounted(element) {
      entries.get(element)?.binding.destroy();
      entries.delete(element);
    },
  };
}

/**
 * Vue trigger directive: `v-tip-glide="text"`, with defaults from createTipGlidePlugin.
 * @remarks Empty/null/false disables a trigger. Reactive updates preserve a visible tooltip.
 * Object values retain the legacy local group adapter for data-tip descendants. SSR performs no DOM work.
 * @public
 */
export const vTipGlide = directive();

/**
 * Configure Vue tooltips once and globally register v-tip-glide.
 * @param options - Application defaults, including lean and warmDuration.
 * @returns A Vue plugin; each app installation receives its own SSR-safe, lazy scope.
 * @remarks Call the factory per application/request. App unmount releases the scope; directive unmount releases each trigger.
 * @example `createApp(App).use(createTipGlidePlugin({ lean: true, warmDuration: 800 })).mount('#app')`
 * @public
 */
export function createTipGlidePlugin(options: TipGlideOptions = {}): Plugin {
  return {
    install(app: App) {
      const scope = createTipGlideScope(options);
      applications.set(app, scope);
      app.directive("tip-glide", directive(scope));
      const destroy = () => {
        scope.destroy();
        applications.delete(app);
      };
      if (typeof app.onUnmount === "function") app.onUnmount(destroy);
      else
        app.mixin({
          unmounted() {
            if (this.$root === this) destroy();
          },
        });
    },
  };
}

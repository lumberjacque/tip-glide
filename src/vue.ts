import {
  defineComponent,
  getCurrentInstance,
  h,
  Teleport,
  shallowRef,
  watch,
  onBeforeUnmount,
} from "vue";
import type { App, ObjectDirective, Plugin, PropType, VNode } from "vue";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import {
  createRichTipGlideScope as createTipGlideScope,
  richContent,
  isRichContent,
} from "./rich.js";
import type { TipGlideRichContent } from "./rich.js";
import type { TipGlideContent } from "./scope.js";
type TipGlideScope = ReturnType<typeof createTipGlideScope>;
type TipGlideTrigger = ReturnType<TipGlideScope["attach"]>;
import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
export { richContent } from "./rich.js";
export type { TipGlideRichContent } from "./rich.js";
const applications = new WeakMap<App, TipGlideScope>();
type Value = TipGlideContent | TipGlideRichContent | TipGlideAdapterOptions;
function directive(fixed?: TipGlideScope): ObjectDirective<HTMLElement, Value> {
  const entries = new WeakMap<
    HTMLElement,
    { group: boolean; binding: TipGlideTrigger | ReturnType<typeof bindTipGlide> }
  >();
  const bind = (element: HTMLElement, value: Value, scope: TipGlideScope | undefined) => {
    const group =
      (typeof value === "object" && value !== null && !isRichContent(value)) ||
      (value === undefined && !scope);
    if (!group && !scope)
      throw new Error("tip-glide: install createTipGlidePlugin before using text directives.");
    return {
      group,
      binding: group
        ? bindTipGlide(element, value as TipGlideAdapterOptions | undefined)
        : scope!.attach(element, value as TipGlideContent | TipGlideRichContent),
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
        (typeof binding.value === "object" &&
          binding.value !== null &&
          !isRichContent(binding.value)) ||
        (binding.value === undefined && !scope);
      if (!old || old.group !== group) {
        old?.binding.destroy();
        entries.set(element, bind(element, binding.value, scope));
      } else if (group)
        (old.binding as ReturnType<typeof bindTipGlide>).update(
          binding.value as TipGlideAdapterOptions | undefined,
        );
      else
        (old.binding as TipGlideTrigger).update(
          binding.value as TipGlideContent | TipGlideRichContent,
        );
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

/**
 * Vue rich tooltip with a default content slot and a scoped trigger slot receiving `ref`.
 * @remarks Install createTipGlidePlugin once. The Teleport stays under the consumer's Vue owner,
 * preserving injections and reactive slot state. A nonempty description prop is required.
 * Content is inert; no extra trigger element is rendered. SSR renders only the trigger slot.
 * @example `<Tooltip description="Pro plan"><template #trigger="{ ref }"><button :ref="ref">Plan</button></template><strong>Pro</strong></Tooltip>`
 * @public
 */
export const Tooltip = defineComponent({
  name: "TipGlideTooltip",
  props: { description: { type: String as PropType<string>, required: true } },
  setup(props, { slots }) {
    const app = getCurrentInstance()!.appContext.app;
    const scope = applications.get(app);
    if (!scope) throw new Error("tip-glide: Tooltip requires createTipGlidePlugin.");
    const target = shallowRef<HTMLElement | null>(null);
    let binding: TipGlideTrigger | undefined;
    let trigger: unknown;
    const render = (host: HTMLElement) => {
      target.value = host;
      return () => {
        target.value = null;
      };
    };
    const value = () => richContent(props.description, render);
    const ref = (element: unknown) => {
      if (trigger === element) return;
      trigger = element;
      binding?.destroy();
      binding = element ? scope.attach(element as HTMLElement, value()) : undefined;
    };
    watch(
      () => props.description,
      () => binding?.update(value()),
    );
    onBeforeUnmount(() => binding?.destroy());
    return () => [
      ...(slots.trigger?.({ ref }) ?? []),
      ...(target.value ? [h(Teleport, { to: target.value }, slots.default?.() as VNode[])] : []),
    ];
  },
});

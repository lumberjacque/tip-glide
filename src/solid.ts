import {
  createComponent,
  createContext,
  createEffect,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import type { Accessor, JSX as SolidJSX } from "solid-js";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
import { createTipGlideScope } from "./scope.js";
import type { TipGlideScope, TipGlideContent, TipGlideTrigger } from "./scope.js";
import type { TipGlideOptions } from "./types.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideContent } from "./scope.js";
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

const ScopeContext = /* @__PURE__ */ createContext<TipGlideScope>();

/** Solid provider props; the provider adds no DOM wrapper. @public */
export interface TipGlideProviderProps {
  /** Reactive central options; omitted fields reset to defaults. */
  options?: TipGlideOptions;
  /** Application content using the tooltip directive. */
  children?: SolidJSX.Element;
}

/**
 * Provide one lazy shared scope to Solid descendants, including portal content.
 * @param props - Central configuration and application content.
 * @returns A context provider; no browser effects run during SSR.
 * @example `<TipGlideProvider options={{ lean: true, warmDuration: 800 }}><App /></TipGlideProvider>`
 * @public
 */
export function TipGlideProvider(props: TipGlideProviderProps): SolidJSX.Element {
  const scope = createTipGlideScope(props.options);
  createEffect(() => scope.configure(props.options));
  onCleanup(() => scope.destroy());
  return createComponent(ScopeContext.Provider, {
    value: scope,
    get children() {
      return props.children;
    },
  });
}

/**
 * Solid tooltip directive used as `use:tooltip={message()}` inside TipGlideProvider.
 * @param element - Trigger element supplied by Solid.
 * @param content - Reactive plain-text accessor; empty/null/false disables the tooltip.
 * @remarks Mount, text changes and owner cleanup are automatic. No per-trigger group is created.
 * @throws When called outside TipGlideProvider.
 * @public
 */
export function tooltip(element: HTMLElement, content: Accessor<TipGlideContent>): void {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("tip-glide: tooltip requires TipGlideProvider.");
  let binding: TipGlideTrigger | undefined;
  onMount(() => {
    binding = scope.attach(element, content());
  });
  createEffect(() => binding?.update(content()));
  onCleanup(() => binding?.destroy());
}

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      tooltip: TipGlideContent;
    }
  }
}

# Rich tooltip content

Rich content is available from version 0.6.0 ([issue #7](https://github.com/lumberjacque/tip-glide/issues/7)). Existing string APIs remain compatible.

Badges, decorative icons and emphasized words can use the same geometric surface, lean, liquid pointer and application configuration. Every rich tooltip requires a nonempty plain-text equivalent for screen readers. Its visual content is inert and aria-hidden. Links, buttons, inputs and interactive widgets belong in a popover. HTML strings are never parsed.

## Vanilla DOM and render callbacks

```ts
import { createRichTipGlideScope, richContent } from "tip-glide/rich";
import "tip-glide/style.css";

const app = createRichTipGlideScope({ lean: true, arrow: true, warmDuration: 800 });
const badge = document.createElement("strong");
badge.textContent = "Pro";
const trigger = app.attach(button, richContent("Pro plan", badge));

trigger.update(
  richContent("Enterprise plan", (host) => {
    const label = document.createElement("strong");
    label.textContent = "Enterprise";
    host.append(label);
    return () => {
      /* release subscriptions created by this renderer */
    };
  }),
);

// On view/app unmount:
trigger.destroy();
app.destroy();
```

`createRichTipGlide(root, options)` offers the same imperative methods as the full controller, accepting strings or `richContent(...)` in `add()` and `setContent()`. A supplied DOM element moves into the tooltip and returns to its original parent/sibling after exit or replacement. A previously detached element is detached again. Do not give two owners the same element at once.

## React and Preact

Use the existing `TipGlideProvider` once. Import `Tooltip` from `tip-glide/react` or `tip-glide/preact`:

```tsx
<Tooltip description="Pro plan" content={<strong className="plan-badge">Pro</strong>}>
  {(ref) => <button ref={ref}>Plan</button>}
</Tooltip>
```

The trigger render function adds no wrapper and lets custom buttons forward or compose the ref. JSX renders through a portal under the caller's providers. Reactive updates retain component state while open; a completed exit, content replacement or unmount disposes it. SSR renders the trigger without mounting tooltip content. React web consumers need matching React DOM installed.

`useTooltip(text)` remains the simplest text binding. It also accepts `richContent(...)` for imperative DOM renderers.

## Angular 20, 21 and 22

Keep `provideTipGlide(options)` in application providers and import `TipGlideDirective` in the consuming component:

```html
<button
  [tipGlide]="planTip"
  [tipGlideContext]="{ $implicit: plan() }"
  [tipGlideDescription]="plan() + ' plan'"
>
  Plan
</button>
<ng-template #planTip let-name>
  <strong class="plan-badge">{{ name }}</strong>
</ng-template>
```

The directive owns the embedded view, its reactive context and destruction. `tipGlideDescription` is required for a template. Plain text and explicit `tipGlideGroup` bindings retain their existing behavior. Context reads resolve against the latest input without replacing Angular's embedded-view context object.

## Vue

Install `createTipGlidePlugin(options)` once, then import `Tooltip` from `tip-glide/vue`:

```vue
<Tooltip description="Pro plan">
  <template #trigger="{ ref }"><button :ref="ref">Plan</button></template>
  <strong class="plan-badge">{{ plan }}</strong>
</Tooltip>
```

The default slot stays reactive through a Teleport and retains Vue injections. The trigger slot must forward its `ref` to a native element.

## Svelte 4 and 5

Call `provideTipGlide(options)` in a parent root/layout. Import `Tooltip` from `tip-glide/svelte/Tooltip.svelte`:

```svelte
<Tooltip description={`${plan} plan`}>
  <button slot="trigger" let:tooltip use:tooltip>Plan</button>
  <strong class="plan-badge">{plan}</strong>
</Tooltip>
```

The scoped trigger slot supplies an action. Default-slot content remains under Svelte's original owner; it is not mounted as a separate application. The shipped source component uses syntax supported by Svelte 4 and 5, so it is compiled with the consumer's Svelte version.

## Solid

Inside `TipGlideProvider`, import `Tooltip` from `tip-glide/solid`:

```tsx
<Tooltip description={`${plan()} plan`} content={<strong>{plan()}</strong>}>
  {(ref) => <button ref={ref}>Plan</button>}
</Tooltip>
```

The owner-preserving portal tracks reactive JSX and disposes it on exit. The existing `tooltip` directive also accepts `richContent(...)`.

## Astro and declarative DOM

Put the existing `tip-glide/astro` group once in the shared layout. Import `Tooltip` from `tip-glide/astro/Tooltip.astro` inside that group:

```astro
<Tooltip description="Pro plan">
  <button slot="trigger">Plan</button>
  <strong class="plan-badge">Pro</strong>
</Tooltip>
```

Astro renders static slot markup into a template. The client registers the real trigger and mounts one template copy when shown. This path supports static markup, not hydrated islands or interactive widgets inside the tooltip. Plain DOM groups can use `data-tip="Pro plan" data-tip-template="plan-template"` with a same-document `<template id="plan-template">`.

## Sizing, styling and lifetime

Style descendants through `.tg-rich-content` or your own global classes. The overlay lives outside the trigger subtree, so styles scoped only to the trigger's container do not reach it. Styles that the framework places directly on the rendered nodes remain present; ancestry-dependent rules may need a global selector.

Only the active rich renderer mounts, once per presentation. The actual content is measured directly, without an offscreen framework clone. `ResizeObserver` retargets the surface when reactive text, an icon or an image changes dimensions. Content remains at its natural scale, with the usual width/height limits and scrolling. Without that observer, call `reposition()` after changes.

Renderer cleanup runs after a completed exit, replacement or destruction. An interrupted exit preserves the mounted content. Return empty text/null/false to disable scoped triggers; rich descriptions must remain nonempty. Provide equivalent descriptions when visible content changes meaning.

The plain `tip-glide`, `tip-glide/scope`, base and native bundles do not import the rich module. Framework adapters include rich rendering; base/native remain text-only. No framework becomes a runtime dependency of the vanilla core.

# Tip Glide

[![npm version](https://img.shields.io/npm/v/tip-glide.svg)](https://www.npmjs.com/package/tip-glide)
[![Core CI](https://github.com/lumberjacque/tip-glide/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lumberjacque/tip-glide/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/lumberjacque/tip-glide/blob/main/LICENSE)

One shared tooltip, gliding between elements. Framework-independent TypeScript with smooth position and size transitions, automatic placement and no runtime dependencies.

[Live demo](https://tip-glide.vercel.app) · [npm](https://www.npmjs.com/package/tip-glide) · [API](#api) · [Performance](https://github.com/lumberjacque/tip-glide/blob/main/PERFORMANCE.md) · [Releases](https://github.com/lumberjacque/tip-glide/releases) · [Issues](https://github.com/lumberjacque/tip-glide/issues)

- **One surface per group.** The tooltip moves and resizes as you move between triggers.
- **Configurable motion.** Choose entrance and exit presets, custom keyframes, directional lean and an optional hover-delay indicator.
- **Flexible placement.** Use a side or any angle, with viewport constraints and an optional container boundary.
- **Keyboard and reduced motion.** Keyboard focus opens immediately, Escape dismisses, and system motion preferences are respected.
- **Framework independent.** Use vanilla JavaScript, React, Vue or Svelte through their normal lifecycle APIs.

[Installation](#installation) · [Quick start](#quick-start) · [API](#api) · [Styling](#styling) · [Frameworks](#react-vue-svelte) · [Accessibility](#accessibility)

## Installation

```sh
npm install tip-glide
```

Import the JavaScript and stylesheet in your application. The package is ESM-only and works with bundlers that support CSS imports, such as Vite. TypeScript declarations are included; no separate types package is needed.

## Quick start

```html
<div id="toolbar">
  <button data-tip="Make something new">Create</button>
  <button data-tip="Keep something good">Save</button>
</div>
```

```ts
import { createTipGlide } from "tip-glide";
import "tip-glide/style.css";

const toolbar = document.querySelector<HTMLElement>("#toolbar");
if (!toolbar) throw new Error("Toolbar not found");

const tips = createTipGlide(toolbar, { arrow: true });
// Call tips.destroy() when the toolbar is removed or its owning view unmounts.
```

Create groups in the browser after the document body and connected triggers exist. Imports are SSR-safe; controller creation needs a DOM. The root itself and its initial `[data-tip]` descendants are registered once. Later elements need `add()`. Triggers may be anywhere in the same document. Each group owns a single visual surface.

Pass `document` instead of an element to register all initial `[data-tip]` elements on the page. In plain JavaScript, omit the `<HTMLElement>` type argument.

### Choose an entry

Both entries share registration, input handling, accessible descriptions and cleanup. Import the JavaScript and CSS for the entry you use:

| Entry                                   | Features                                                                                             | Measured JS + CSS gzip |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------: |
| `tip-glide` + `tip-glide/style.css`     | Full motion, liquid pointer, lean, fuse, custom transitions, 360° placement and container boundaries |                8.09 kB |
| `tip-glide/base` + `tip-glide/base.css` | Native CSS travel and size transitions, four-side placement, viewport constraints and fixed fades    |                3.91 kB |

The base entry is available from version 0.2.0:

```ts
import { createTipGlide } from "tip-glide/base";
import "tip-glide/base.css";

const tips = createTipGlide(document, { placement: "top", duration: 180 });
```

The base entry keeps the shared tooltip, size morphing, hover delays, keyboard behavior, accessible descriptions, reduced motion and cleanup. Position and size transitions run through native CSS, without a JavaScript animation loop. It supports four sides, automatic opposite-side fallback and viewport clamping. The lifecycle methods are the same; `update()` accepts `TipGlideBaseOptions` only.

Use the full entry for liquid arrows, lean, fuse, custom enter/exit animations, element boundaries or arbitrary-angle placement and routing. Those visual modules are excluded from the base consumer bundle. Import the stylesheet matching your entry; each contains its own shared styles.

Sizes come from minified consumer bundles, with JavaScript and CSS compressed separately. They exclude declarations, tests and the private demo website. See [measurement methodology and limitations](https://github.com/lumberjacque/tip-glide/blob/main/PERFORMANCE.md) for exact results and reproducible commands.

### Dynamic triggers and cleanup

```ts
const button = document.createElement("button");
button.textContent = "Export";
toolbar.append(button);

const unregister = tips.add(button, "Download your work");

// Re-register to change the description. Text is never interpreted as HTML.
const unregisterUpdated = tips.add(button, "Download as a PDF");
unregister(); // Safe: an old cleanup cannot remove the new registration.

unregisterUpdated();
button.remove();

// Release all descriptions, listeners, observers and pending animations.
tips.destroy();
```

Adding a `data-tip` attribute or changing its value after initialization does not register or update a trigger automatically. Call `add()` for those changes. Removed triggers are unregistered automatically; explicit cleanup is also supported.

## API

All public types and methods include TSDoc in the published declaration files.

| Method                           | Behavior                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createTipGlide(root, options?)` | Register the initial triggers and return a group controller.                                                                                                             |
| `add(trigger, text?)`            | Register or replace a trigger's text. Defaults to `data-tip`. Returns an idempotent cleanup function. Replacing a registration dismisses that trigger's current tooltip. |
| `show(trigger)`                  | Immediately show a registered trigger, with glide if another surface was visible. Does not focus the trigger. Unknown or disconnected triggers are ignored.              |
| `hide()`                         | Dismiss and cancel pending opening. New input or an explicit `show()` can reopen.                                                                                        |
| `update(options)`                | Merge partial settings, cancel pending opening and re-measure a visible surface. Invalid settings throw before changing state.                                           |
| `reposition()`                   | Re-measure after application-driven layout changes. Position updates from scroll and resize are automatic.                                                               |
| `destroy()`                      | Remove all owned DOM, observers, timers and listeners. Repeated calls and later controller operations are harmless.                                                      |

An old cleanup function cannot remove a newer registration. Empty descriptions are ignored. `add()` and `boundary` reject elements from another document. Timing and distance options must be finite and nonnegative; placement angles may be any finite number.

### Options

| Option            | Default    | Meaning                                                                                |
| ----------------- | ---------- | -------------------------------------------------------------------------------------- |
| `placement`       | `'top'`    | A side or degrees: 0 above, 90 right, 180 below, 270 left. Angles wrap at 360.         |
| `boundary`        | `null`     | An element's client box intersected with the visible viewport; null uses the viewport. |
| `arrow`           | `false`    | Pointer integrated into the rounded contour.                                           |
| `arrowBlend`      | `0.7`      | Pointer join: `0` geometric, `1` liquid; finite values from 0 to 1.                    |
| `enter`           | `'scale'`  | `'scale'`, `'fade'`, `'slide'`, `'none'`, or a custom `TipAnimation`.                  |
| `exit`            | `'scale'`  | Same presets or custom keyframes, independent from entry.                              |
| `gap`             | `12`       | Distance from the trigger, in CSS pixels.                                              |
| `viewportPadding` | `12`       | Padding inside the effective viewport/container boundary, in CSS pixels.               |
| `openDelay`       | `400`      | First pointer hover delay, in milliseconds. Focus opens immediately.                   |
| `closeDelay`      | `120`      | Time to cross the gap to the tooltip or another trigger.                               |
| `warmDuration`    | `600`      | After closing, subsequent hovers skip the delay within this window.                    |
| `duration`        | `180`      | Travel and size morph duration. Set to `0` for instant handoffs.                       |
| `lean`            | `true`     | A bounded directional tilt during a handoff.                                           |
| `showFuse`        | `false`    | Initial delay progress on the trigger edge facing the resolved tooltip.                |
| `motion`          | `'system'` | Follow live reduced-motion settings, or use `'reduced'` explicitly.                    |
| `className`       | `''`       | Class on the body-mounted overlay for styling.                                         |

### Styling

Import the stylesheet matching your entry once: `tip-glide/style.css` for full or `tip-glide/base.css` for base. Both are marked as side effects for bundlers; JavaScript does not inject styles. Create a theme by passing `className: 'my-tips'`:

```css
.my-tips {
  --tg-background: #f5efff;
  --tg-color: #31203f;
  --tg-border: #cbb5dc;
  --tg-radius: 12px;
  --tg-padding: 10px 14px;
  --tg-font: 500 13px/1.45 system-ui, sans-serif;
  --tg-shadow: 0 8px 28px #0003;
  --tg-max-width: 280px;
  --tg-max-height: 300px;
  --tg-fuse-color: #8b5bc7;
  --tg-scrollbar-thumb: #827a91;
  --tg-scrollbar-track: transparent;
}
```

The visual overlay is mounted directly under `document.body` to escape ordinary clipping containers. Root-local CSS variables do not inherit into it; use the overlay class. Internal `.tg-*` DOM is not a public API. Colors, font and variables are the supported styling surface.

### Angles, boundaries and custom motion

```ts
import { createTipGlide } from "tip-glide";

const canvas = document.querySelector<HTMLElement>("#canvas");
if (!canvas) throw new Error("Canvas not found");

const tips = createTipGlide(canvas, {
  boundary: canvas,
  placement: 315,
  arrow: true,
  showFuse: true,
  enter: {
    keyframes: [
      { opacity: 0, transform: "translateY(4px) scale(0.94)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    duration: 160,
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  },
  exit: "fade",
});
// During an application-owned drag:
tips.reposition();
```

Placement follows the exact requested angle, then slides along the boundary when room runs out. If that correction overlaps the trigger, it chooses the nearest available side. Side changes travel around the trigger rather than through it. The pointer follows the rounded perimeter and stays connected to the body, including at corners; `arrowBlend` controls its geometric-to-liquid join. Triggers wholly outside the boundary or viewport are dismissed. Text wraps within the available width, including unbroken words; descriptions taller than `--tg-max-height` or available space scroll without truncating the accessible description. Give containers enough room for the tooltip padding.

Custom animation keyframes run on a dedicated entrance/exit layer, separate from travel, lean and size morphing. When the browser provides `KeyframeEffect`, keyframes and timing are validated before creating a group or applying an update. Provide at least two valid Web Animations keyframes; durations must be finite and nonnegative, easing must be valid CSS. Prefer transform and opacity. The default durations are 180 ms on entry and 140 ms on exit. System reduced motion and keyboard focus bypass custom effects too. `duration: 0` disables travel and resize, while `enter: 'none'` and `exit: 'none'` disable the respective effects.

### Framework adapters

The core import stays framework independent. From version 0.3.0, optional entry points integrate with React, Vue 3, Svelte 4/5, Angular, Solid, Preact and Astro. Import `tip-glide/style.css` once in your application. You do not need to write mounting or cleanup hooks.

Adapters watch their group's `data-tip` attributes and children. Conditional triggers register automatically, changed descriptions update, and removed triggers unregister. Configuration updates replace the previous configuration, so omitted fields reset to their documented defaults. Existing `aria-describedby` tokens are preserved.

#### React

```tsx
"use client";
import { TipGlide } from "tip-glide/react";
import "tip-glide/style.css";

export function Toolbar() {
  return (
    <TipGlide options={{ arrow: true, lean: true }} className="toolbar">
      <button data-tip="Make something new">Create</button>
      <button data-tip="Keep something good">Save</button>
    </TipGlide>
  );
}
```

`TipGlide` renders a `div` and forwards its native attributes. `className` styles that div; `options.className` styles the tooltip overlay. For another existing element, use the callback-ref hook:

```tsx
import { useTipGlide } from "tip-glide/react";

function Actions() {
  const tips = useTipGlide<HTMLElement>({ arrow: true });
  return (
    <nav ref={tips}>
      <button data-tip="Save changes">Save</button>
    </nav>
  );
}
```

The hook owns the controller, including ref replacement, unmount and React Strict Mode replay. Server rendering produces ordinary markup; no browser globals are read during import or rendering. Framework components need a client boundary in React Server Component applications.

#### Vue

```vue
<script setup lang="ts">
import { vTipGlide } from "tip-glide/vue";
import "tip-glide/style.css";
</script>

<template>
  <div v-tip-glide="{ arrow: true, lean: true }">
    <button data-tip="Make something new">Create</button>
    <button data-tip="Keep something good">Save</button>
  </div>
</template>
```

Use the directive on a native element. The directive's lifecycle owns updates and teardown; it performs no browser work during server rendering.

#### Svelte

```svelte
<script lang="ts">
  import { tipGlide } from "tip-glide/svelte";
  import "tip-glide/style.css";
</script>

<div use:tipGlide={{ arrow: true, lean: true }}>
  <button data-tip="Make something new">Create</button>
  <button data-tip="Keep something good">Save</button>
</div>
```

The action supports reactive parameters and cleans up when Svelte removes its element. It does not execute during server rendering.

#### Angular

Import the standalone directive in your component. The library ships Angular's partial compilation output, so your application can compile its templates normally.

```ts
import { Component } from "@angular/core";
import { TipGlideDirective, type TipGlideAdapterOptions } from "tip-glide/angular";
import "tip-glide/style.css";

@Component({
  imports: [TipGlideDirective],
  template: '<nav [tipGlide]="options"><button data-tip="Save a copy">Save</button></nav>',
})
export class Toolbar {
  readonly options: TipGlideAdapterOptions = { arrow: true, lean: true };
}
```

The directive starts after the browser renders. Bound options update automatically; destruction cancels pending setup and destroys the group. Supports Angular 21 and 22.

#### Solid

```tsx
import { createTipGlideRef } from "tip-glide/solid";
import "tip-glide/style.css";

export function Toolbar(props: { lean: boolean }) {
  const ref = createTipGlideRef(() => ({ lean: props.lean, arrow: true }));
  return (
    <nav ref={ref}>
      <button data-tip="Save a copy">Save</button>
    </nav>
  );
}
```

Call the ref factory during component setup. The accessor tracks reactive options; the component owner handles teardown. No browser work runs during SSR.

#### Preact

```tsx
import { TipGlide } from "tip-glide/preact";
import "tip-glide/style.css";

export function Toolbar() {
  return (
    <TipGlide options={{ arrow: true, lean: true }}>
      <button data-tip="Save a copy">Save</button>
    </TipGlide>
  );
}
```

Preact also exports `useTipGlide` for attaching to an existing native element. It uses Preact's own hooks and needs no React compatibility layer.

#### Astro

```astro
---
import TipGlide from "tip-glide/astro";
---

<TipGlide options={{ arrow: true, lean: true, boundary: "root" }}>
  <button data-tip="Save a copy">Save</button>
</TipGlide>
```

The Astro component includes the stylesheet and its client script. It needs no `client:*` directive or UI framework runtime. Options are serialized to JSON, so use `boundary: "root"` or `null` rather than a DOM element. Custom keyframes can be plain serializable objects. The native group disconnects on removal and reconnects after navigation, including Astro's client router. Updating its `data-tip-glide-options` JSON attribute updates the group.

#### Adapter options

The six JavaScript adapter entry points export the `TipGlideAdapterOptions` type. Astro exports its component props from the `.astro` component. It accepts the core options and two additions:

- `boundary: "root"` confines the tooltip to the adapter's own group element. A same-document element or `null` also works.
- `alwaysVisible: true` shows the first nonempty trigger when the group mounts or that trigger changes. This is a touch-preview convenience, not a controlled open state; Escape, blur and normal tooltip interactions still apply.

Invalid options throw the same validation errors as the core. The adapters add no runtime framework dependency to the core or base entry. Frameworks are optional peers; install only the framework your application uses. Vue and Svelte use type-only framework imports. The core and base entry points never import an adapter. Other environments can use the imperative core API.

The package also exports `TipGlide`, `TipGlideOptions`, `Placement`, `MotionPreference`, `TipAnimation` and `TipTransition` as TypeScript types.

## Motion and input

The first hover waits briefly; adjacent hovers skip that wait. Travel and size retarget from the currently displayed pixel geometry, keeping the background and clip together. Text stays at its natural scale. Measurements round fractional sizes upward so the visible width cannot create an unmeasured extra line. New text fades in once the surface can contain all its lines. Travel and size share a finite animation; velocity drives a damped, bounded lean that settles afterward. Entry and exit have an independent animation layer. With the default `arrow: false`, the surface uses CSS and allocates no SVG. Enabling the pointer creates one reusable SVG contour. Its exact lines and arcs use a bounded number of segments regardless of tooltip size, without SVG filters or canvas. Travel segment lengths are measured once per glide; animation frames only sample the prepared path. Animation cancellation is expected and handled. There is no perpetual animation loop.

Keyboard focus opens and moves immediately, without a positional transition. Escape cancels pending work and dismisses. Touch pointers do not generate tooltip hovers. A tooltip reached by pointer remains visible while hovered. Document visibility changes and window blur dismiss it. Scrolling cancels a pending fuse; re-enter the trigger to restart it.

Scroll, window/visual viewport resize and trigger/content/boundary size changes re-measure an open surface. Layout changes caused only by moving siblings or CSS transforms require `reposition()`.

## Browser support and limitations

The library targets modern evergreen browsers with Pointer Events, `matchMedia` and modern CSS support. When `ResizeObserver` is unavailable, call `reposition()` after element size changes. Without the Web Animations API, its JavaScript-driven fades and entry/exit effects are immediate. The full entry's travel and size motion use `requestAnimationFrame`; base uses native CSS transitions.

Imports are SSR-safe, but `createTipGlide()` requires a browser document with an existing body. The package provides ESM exports; CommonJS `require()` is not an advertised entry point.

This library is designed for plain-text tooltips. Top-layer dialogs, transformed document bodies or boundary containers, closed Shadow DOM, and interactive tooltip contents are unsupported. Use a popover for links, buttons or other interactive content.

## Accessibility

Every trigger receives its own stable plain-text `role="tooltip"` description referenced by `aria-describedby`. Existing description tokens are preserved; cleanup removes only the token this group added. The shared visual overlay is hidden from assistive technology so switching anchors does not change another trigger's description. Accessible names and native focus outlines are left intact.

Reduced motion removes travel, tilt and size animation; the fuse becomes a static indicator. Live system changes are respected. Tooltip triggers must have meaningful visible labels or accessible names. Do not put essential instructions solely inside a tooltip. Do not put links or controls inside one; use a popover instead. Behavior is informed by the [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/).

## Troubleshooting

- **The tooltip is missing or unstyled.** Import the stylesheet matching your entry, initialize after mounting, and make sure the trigger is connected, has a nonempty description and is inside the effective boundary.
- **A new button has no tooltip.** Call `tips.add(button)` after adding it to the document. The initial `data-tip` scan runs once.
- **A changed description is not shown.** Call `tips.add(button, "Updated description")` to replace the registration.
- **Theme variables have no effect.** Apply them to the class passed through `className`. The overlay is mounted under `document.body`, so it does not inherit variables from the trigger's container.
- **Position is stale after a layout change.** Call `tips.reposition()` when a sibling moves the trigger or a CSS transform changes its position.

## Development

From the library repository root, use Node.js 22.12 or newer:

```sh
npm ci
npm run typecheck
npm run test
npm run verify
```

`src/lifecycle.ts` shares input handling, registration and cleanup between both entries. The full entry is defined in `src/index.ts`; the lightweight entry is in `src/base.ts`. Renderers own DOM measurement and visual motion, with placement, routing and contour math in separate modules. Tests cover positioning, rapid handoffs, timing, focus, Escape, touch, description ownership and reduced motion. DOM simulation tests do not substitute for browser motion checks.

`npm run size` bundles the built ESM with esbuild and measures JavaScript and CSS separately. Combined gzip budgets are 8.1 kB for full and 4 kB for base. The check also prevents the full renderer and advanced motion modules from entering the base import. See command output for exact current bytes.

`npm run bench` reports pure geometry timings. `npm run bench:browser` compares both entries in installed Edge on desktop and narrow viewports, without starting the demo website. See [PERFORMANCE.md](https://github.com/lumberjacque/tip-glide/blob/main/PERFORMANCE.md) for browser selection, workloads and measurement limits.

To inspect the npm package contents without publishing:

```sh
npm pack --dry-run
```

`npm pack` builds the library through `prepack` and rejects unexpected or stale outputs. `npm publish` runs the complete verification through `prepublishOnly`. Verification also installs a real tarball in a temporary consumer and checks server-safe imports, TypeScript declarations and the CSS export. The package contains built JavaScript, declarations, CSS, documentation and the MIT license; the demo website is maintained separately.

## Contributing and releases

See [CONTRIBUTING.md](https://github.com/lumberjacque/tip-glide/blob/main/CONTRIBUTING.md) for development conventions.
Report reproducible bugs in [GitHub Issues](https://github.com/lumberjacque/tip-glide/issues).
Version history and release notes live in [GitHub Releases](https://github.com/lumberjacque/tip-glide/releases).

## License

MIT. See [LICENSE](https://github.com/lumberjacque/tip-glide/blob/main/LICENSE).

### Adapter checks

`npm run test:adapters` exercises real React, Vue, Angular, Solid and Preact lifecycles, a compiled Svelte component, Astro connection/reconnection, dynamic triggers and cleanup. `npm run check:install` builds an isolated consumer from the packed package, proves that a vanilla install brings in no framework, checks public types and SSR imports, compiles an Angular consumer with strict templates, and checks/builds a minimal Astro page. Run `npm run build` first.

CI runs lifecycle tests on Node 22 and 24 on Windows and Linux. A separate packed-consumer job checks the distributable, including Angular and Astro. `npm run verify` runs all checks locally.

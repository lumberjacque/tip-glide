# Architecture

The controller owns input and lifetime. Renderers own presentation. This is a small Strategy interface, not a plugin framework.

- `lifecycle.ts`: registration, stable accessible descriptions, hover/focus/tap, delays, drag dismissal and teardown. A press record distinguishes a tap from a drag without a state-machine dependency.
- `view-contract.ts`: the internal renderer boundary. Entry points choose the renderer once; there is no runtime mode switching.
- `view.ts`: geometric placement, size morphing, lean, fuse and the continuously connected liquid pointer. Pure geometry, contour and motion helpers remain separate.
- `base-view.ts`: measured four-side placement and CSS interpolation.
- `native-view.ts` and `native.css`: CSS Anchor Positioning, content sizing and opacity fades. No JS positioning loop; no geometric feature emulation. Native anchor names are shared/restored safely when groups use the same trigger.
- `overlay.ts`: manual popover top-layer ownership, delayed exit and interrupted-close cancellation. Full/base keep a body-host fallback. Hosts invoked from a modal remain inside that modal subtree to retain input access.
- `removals.ts`: one document observer, trigger callbacks stored weakly and lookup through removed subtrees. Added elements and text updates never trigger a scan of all registered triggers.
- `adapters/binding.ts`: declarative reconciliation shared by framework adapters and the public Web Component. The imperative core does not import adapters.

Public configuration lives in `types.ts`, with narrower entry types for base/native. Options are validated before mutating an existing group. Imports do not read browser globals. Creating a group, registering the Web Component or querying browser capabilities is explicit.

Native capability detection is public; fallback selection belongs to the application. This keeps older-browser positioning code out of a native-only bundle. The full entry remains the choice when the pointer must stay connected through a geometric route. A Web Component is another interface to that behavior, not a replacement for its geometry.

Tests cover shared interaction invariants and renderer-specific work. Browser tests cover actual layout/top-layer behavior in Chromium and WebKit. Size checks inspect each consumer bundle independently and reject advanced-module imports in base/native.

## Application scopes (0.5.0)

`scope.ts` owns central defaults and lazy, reference-counted groups by document. Framework trigger bindings attach plain text to this interface; they do not create a controller per element. Each framework supplies its own ownership mechanism: React/Preact context, Angular application DI, a Vue app plugin, Svelte context/actions and Solid context/directive owners. Astro keeps the single root group in the shared layout and observes text attributes.

The scope is created per application/request, not as a mutable document/global singleton. Providers can share a scope through portals without relying on DOM ancestry. Empty text disables a trigger and releases its registration. Changing nonempty text uses the core's setContent path so a visible tooltip and its stable accessible description survive the update. The last registered trigger releases the controller and its warm history; later attachment starts a fresh group.

Existing group wrappers/actions remain local and independent. They do not silently join an application's scope. Full text-binding adapters remain optional entry points; importing the geometry core or base/native entry never imports framework runtimes or scope code.

## React ownership and SSR

The provider holds a stable scope object in a ref. Rendering creates no controller, document node or listener. Element callback refs attach after commit; effects apply committed text/configuration. Cleanup is attached to element ownership, so the final nonempty trigger releases its document group, including during Strict Mode replay. The scope is not a mutable global configuration object. SSR requests render through separate provider instances.

Application bindings are the primary integration path. Explicit local groups are an independent alternative for bounded demos. They do not automatically inherit application scope defaults. This keeps the two ownership models explicit and prevents accidentally allocating one tooltip controller per button.

Next.js App Router consumers use a client provider wrapper and client hook consumers; server layouts can pass children through that wrapper. CSS is imported once at the application boundary. No tooltip interaction or generated accessible description is promised before client hydration. Existing tests cover React server rendering, missing-provider errors, stable registration through Strict Mode and live text updates; they are not an end-to-end certification of every SSR framework/version.

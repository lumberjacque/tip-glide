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

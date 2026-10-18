# Performance

Download size and runtime work are separate measurements. Smaller gzip output does not establish a frame rate.

## Reproduce

Run from `core` after `npm ci`:

```sh
npm run verify
npm run bench
npm run bench:browser
npm run bench:browser -- --same-size
```

`verify` runs deterministic correctness/work-budget tests, builds all three entries, checks gzip budgets, and installs the packed package in an isolated consumer. `bench` reports pure JavaScript geometry timings. `bench:browser` uses Playwright Core with installed Edge in headless mode. It does not start the website or take screenshots. Set `BROWSER_CHANNEL=chrome` or `BROWSER_EXECUTABLE` to use a different installed Chromium browser. No browser is automatically downloaded.

The browser benchmark reports the browser version, initialization time for 1,000 triggers, median/p95 synchronous handoff cost, native frame intervals and total script/layout/style time across 150 frames. It compares no-library control, base and full (arrow + lean). The narrow profile uses a 390 × 844 viewport and 4× CPU throttling; it is **not a physical phone**. Handoffs occur every four browser frames. There is no artificial 30/60 fps cap.

Frame cadence in headless Edge varied substantially in the local run, even though synchronous handoffs were short. Treat those timings as local diagnostics, not evidence of a guaranteed 120/144 Hz experience. Compare repeated runs on the same hardware, and profile paint/compositing on target devices before making an FPS claim. Timing percentiles are not flaky pass/fail CI thresholds. Browser exceptions, idle animation loops, incomplete cleanup and settled viewport/clip violations do fail the benchmark.

## Size

`npm run size` bundles each shipped entry with esbuild, minifies it and applies Node's default gzip settings. CSS is compressed separately, as a separate browser resource, then added to JavaScript. Decimal kB means 1,000 bytes. Source maps, declarations, development tools and the private website are excluded.

| Entry              |  JS gzip | CSS gzip | Combined | CI ceiling |
| ------------------ | -------: | -------: | -------: | ---------: |
| `tip-glide/base`   | ~3.99 kB | ~0.68 kB | ~4.67 kB |    4,700 B |
| `tip-glide`        | ~8.17 kB | ~0.70 kB | ~8.87 kB |    8,900 B |
| `tip-glide/native` | ~3.72 kB | ~0.74 kB | ~4.45 kB |    4,500 B |

The script reports exact current bytes. It also fails if the base bundle pulls in the full renderer, liquid contour, full options or JavaScript motion module. All three entries have zero runtime package dependencies. Playwright and esbuild are development dependencies only.

The 3 kB combined goal is **not met**. Base still includes the shared lifecycle, accessible descriptions, input handling, live motion preferences, resize/scroll handling, runtime validation and cleanup. The current regression ceiling records what the implementation actually achieves; it is not a claim that the original target passed. Full functionality remains available at the original import path.

To test the stricter goal explicitly, run `npm run size -- --base-budget=3000` after building. It currently exits with a failure showing the measured combined size.

## Deterministic work budgets

`tests/performance.test.ts` checks:

- Full arrow/lean motion under simulated 60, 120 and 144 Hz retargeting: no layout/computed-style reads inside animation callbacks, at most one pending travel callback, one reused SVG/path and no idle loop after settling.
- Re-measuring unchanged full tooltips does not restart travel. Equal-size handoffs do not rewrite SVG viewport dimensions; dimensions still refresh after size changes or re-enabling a hidden contour.
- Base retargeting: zero library JavaScript animation callbacks; the browser owns position/size interpolation.
- Equal delegated document/window listener counts for one and 1,000 triggers. Per-trigger accessible descriptions intentionally scale with trigger count.
- A 200-event scroll/resize burst becomes one scheduled update, canceled on destruction.

Geometry tests bound SVG contour command count independently of surface size and ensure path segment lengths are prepared once rather than recomputed each frame. Other tests cover rapid interruption, natural text measurement, keyboard and touch behavior, reduced motion and lifecycle ownership.

These are work/correctness assertions in a DOM simulator, not browser render-time measurements. CSS width/height interpolation still requires browser layout; moving it out of JavaScript does not make resizing compositor-only. Pure geometry microbenchmarks likewise exclude DOM layout, SVG paint, compositing and display scheduling.

## Full-renderer optimization round, 2026-10-15

All public features remain available. The implementation now skips travel when its target and spring are settled, skips unchanged SVG viewport writes, reuses repeated contour calculations and direction lookup tables, and avoids computed-style reads on instant/disabled exits. Custom keyframe arrays are copied without cloning every frame object. Routing uses indexed visitation instead of a Set; event lookup and mutation filtering avoid per-event callbacks/temporary NodeList arrays. Observer registration and dismissal behavior share helpers. CSS keeps customization through variables, with single-use defaults expressed as fallbacks.

Before/after runs of the fixed-text-size browser fixture used Edge 155.0.4283.45, 1,000 triggers, 150 native frames and 38 handoffs:

| Metric                             |   Before |    After |
| ---------------------------------- | -------: | -------: |
| Desktop SVG viewBox writes         |      253 |        0 |
| Narrow / 4× CPU SVG viewBox writes |      213 |        0 |
| Desktop total script time          | 13.90 ms |  9.77 ms |
| Narrow / 4× CPU total script time  | 62.48 ms | 42.54 ms |

Timing figures are single local runs, with different frame scheduling and animation callback counts. They suggest less work but do not establish a repeatable percentage speedup or FPS gain. Avoiding redundant viewport writes is also covered by a deterministic regression test. The alternating-size fixture still updates SVG dimensions where the surface actually morphs, and checks settled geometry, default styling and CSS-variable overrides.

Full combined gzip changed from 8,091 to 8,089 bytes: effectively unchanged. Base changed from 3,928 to 3,906 bytes. This round primarily reduces work while running, rather than download size.

## Native placement and shared interactions, 0.4.0

The previous 0.3.1 consumer bundles measured 8,098 bytes combined gzip for full and 3,918 for base. The new shared top-layer host, explicit touch/drag policy and shared removal registry bring them to 8,873 and 4,670 bytes. Regression ceilings were intentionally revised for these additional behaviors. They are not evidence of a size optimization. The native entry measures 4,454 bytes: only 216 bytes less than base, because it keeps the same accessibility and input lifecycle. It is not a sub-3-kB implementation.

Native runtime work is the useful distinction: CSS owns placement and dimensions, with no trigger measurements, ResizeObserver or library animation/positioning frame loop. Full retains geometric routing and its liquid pointer. Native omits gliding, size morphing and advanced geometry rather than pretending CSS provides the same behavior.

`npm run test:browser` runs real Chromium and WebKit at a touch-sized viewport, including a modal dialog/top-layer case, interrupted exits, viewport fallback, tap input, scrollable long text and removal cleanup. It asserts zero native-renderer geometry reads and scheduled frames. The CI browser job runs this separately from deterministic tests. These checks do not claim a physical iPhone frame rate.

A real CDP touch gesture additionally guards scrolling in the top layer. Native scroll takeover emits `pointerleave`; the hover-close handler ignores that event for touch pointers so it does not dismiss the scrolling surface. A tooltip invoked from a modal dialog keeps its host inside that dialog's subtree, because a body sibling would remain inert even when painted in the top layer.

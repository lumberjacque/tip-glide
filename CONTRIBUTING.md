# Contributing

Keep the public core small, framework independent and free of runtime dependencies. The demo website is maintained separately and is not part of this repository's license or package.

Use strict TypeScript. Public exports require TSDoc with units, defaults, errors, cleanup behavior and a usage example when appropriate. Keep browser effects inside the controller or view; placement math stays pure. No browser globals may be evaluated during module import. Preserve native names, focus outlines and existing ARIA description tokens.

New interaction behavior should have focused tests. Validate cancellation, rapid handoffs and repeated cleanup, not only the happy path. Run `npm run test:browser` after view changes (install the Chromium/WebKit Playwright browsers first); simulated layout cannot prove frame continuity. Respect reduced motion and touch hover gating.

Run `npm run format` and `npm run verify` before submitting a change. The size check budgets JavaScript plus separately compressed CSS: 9 kB gzip for full, 4.8 kB for base and 4.5 kB for native; the separate application-scope entry has a 10 kB ceiling. It also prevents advanced modules from entering the base bundle. Keep the controller lifecycle shared; each renderer owns its visual feature set. See [performance methodology](./PERFORMANCE.md) for browser benchmarks and measurement limits. Commit the lockfile, source, tests and documentation; do not commit `node_modules`, build output or packed archives.

Framework adapters belong in separate package entry points with optional peer dependencies. Keep ownership in the shared binding: it reconciles dynamic triggers, validates full option replacements and disconnects before destroying the core. Test real framework mount/update/unmount behavior and SSR imports. The Angular directive must ship partial compilation output; the packed-consumer CI job compiles its strict templates and checks the Astro component outside this repository.

import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Input,
  InjectionToken,
  makeEnvironmentProviders,
} from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { createTipGlideScope } from "./scope.js";
import type { TipGlideScope, TipGlideContent, TipGlideTrigger } from "./scope.js";
import type { TipGlideOptions } from "./types.js";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
function ownScope(options: TipGlideOptions = {}) {
  const scope = createTipGlideScope(options);
  inject(DestroyRef).onDestroy(() => scope.destroy());
  return scope;
}
const SCOPE = new InjectionToken<TipGlideScope>("TipGlideScope", {
  providedIn: "root",
  factory: ownScope,
});

/**
 * Set application-wide tooltip defaults in Angular's application config.
 * @param options - Central options, including lean and warmDuration.
 * @returns Environment providers; each application injector owns an isolated lazy scope.
 * @remarks SSR-safe. Import TipGlideDirective in components using the attribute and the CSS once globally.
 * @example `providers: [provideTipGlide({ lean: true, warmDuration: 800 })]`
 * @public
 */
export function provideTipGlide(options: TipGlideOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: SCOPE, useFactory: () => ownScope(options) }]);
}

/**
 * Angular trigger directive: `tipGlide="Save"` or `[tipGlide]="dynamicText"`.
 * @remarks Text bindings share the application's provideTipGlide configuration and visual surface.
 * Empty/null/false disables the trigger. Object input retains the legacy data-tip group adapter;
 * use tipGlideGroup for new group integrations. Browser setup runs after render; cleanup is automatic.
 * @example `<button [tipGlide]="message">Save</button>`
 * @public
 */
@Directive({ selector: "[tipGlide]", standalone: true })
export class TipGlideDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scope = inject(SCOPE);
  private binding: TipGlideTrigger | ReturnType<typeof bindTipGlide> | undefined;
  private value: TipGlideContent | TipGlideAdapterOptions;
  private mounted = false;
  private group = false;

  /** Reactive plain text; null/empty/false disables it. Object values retain legacy group configuration. */
  @Input()
  set tipGlide(value: TipGlideContent | TipGlideAdapterOptions) {
    this.value = value;
    if (this.mounted) this.apply();
  }
  private apply() {
    const group = typeof this.value === "object" && this.value !== null;
    if (!this.binding || group !== this.group) {
      this.binding?.destroy();
      this.binding = group
        ? bindTipGlide(this.element.nativeElement, this.value as TipGlideAdapterOptions)
        : this.scope.attach(this.element.nativeElement, this.value as TipGlideContent);
      this.group = group;
    } else if (group)
      (this.binding as ReturnType<typeof bindTipGlide>).update(
        this.value as TipGlideAdapterOptions,
      );
    else (this.binding as TipGlideTrigger).update(this.value as TipGlideContent);
  }
  /** Own post-render setup and cancel it if the directive is destroyed first. */
  constructor() {
    const pending = afterNextRender(() => {
      this.mounted = true;
      this.apply();
    });
    inject(DestroyRef).onDestroy(() => {
      pending.destroy();
      this.binding?.destroy();
    });
  }
}

/** Explicit Angular group adapter for data-tip descendants; options belong to this local group. @public */
@Directive({ selector: "[tipGlideGroup]", standalone: true })
export class TipGlideGroupDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private binding: ReturnType<typeof bindTipGlide> | undefined;
  private options: TipGlideAdapterOptions | undefined;
  /** Full local group configuration. Omitted fields reset to defaults. */
  @Input()
  set tipGlideGroup(options: TipGlideAdapterOptions | "" | undefined) {
    const next = options === "" ? undefined : options;
    this.binding?.update(next);
    this.options = next;
  }
  /** Own post-render group setup and teardown. */
  constructor() {
    const pending = afterNextRender(() => {
      this.binding = bindTipGlide(this.element.nativeElement, this.options);
    });
    inject(DestroyRef).onDestroy(() => {
      pending.destroy();
      this.binding?.destroy();
    });
  }
}

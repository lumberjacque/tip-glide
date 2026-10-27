import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Input,
  InjectionToken,
  makeEnvironmentProviders,
  TemplateRef,
  ViewContainerRef,
} from "@angular/core";
import type { EnvironmentProviders, EmbeddedViewRef, OnChanges } from "@angular/core";
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
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";
export { richContent } from "./rich.js";
export type { TipGlideRichContent } from "./rich.js";
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
 * Angular trigger directive for text, richContent or a TemplateRef with context and description.
 * @remarks Bindings share the application's provideTipGlide configuration and visual surface.
 * Empty/null/false disables the trigger. Options objects retain the legacy data-tip group adapter;
 * use tipGlideGroup for new group integrations. Browser setup runs after render; cleanup is automatic.
 * @example `<button [tipGlide]="message">Save</button>`
 * @public
 */
@Directive({ selector: "[tipGlide]", standalone: true })
export class TipGlideDirective implements OnChanges {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scope = inject(SCOPE);
  private readonly container = inject(ViewContainerRef);
  private binding: TipGlideTrigger | ReturnType<typeof bindTipGlide> | undefined;
  private value:
    | TipGlideContent
    | TipGlideRichContent
    | TipGlideAdapterOptions
    | TemplateRef<object>;
  private template: TemplateRef<object> | undefined;
  private embedded: EmbeddedViewRef<object> | undefined;
  private renderTemplate: TipGlideRichContent["render"] | undefined;
  private mounted = false;
  private group = false;

  /** Reactive text, richContent or TemplateRef; null/empty/false disables it. Options retain legacy groups. */
  @Input()
  set tipGlide(
    value: TipGlideContent | TipGlideRichContent | TipGlideAdapterOptions | TemplateRef<object>,
  ) {
    this.value = value;
  }
  /** Required plain-text equivalent when tipGlide receives a TemplateRef. */
  @Input() tipGlideDescription = "";
  /** Reactive context for the embedded template, including $implicit and named let bindings. */
  @Input() tipGlideContext: object = {};
  /** Batch Angular's input changes before creating or updating tooltip content. */
  ngOnChanges() {
    if (this.mounted) this.apply();
  }
  private apply() {
    let value = this.value;
    if (value instanceof TemplateRef) {
      if (this.template !== value) {
        const template = value;
        this.template = template;
        this.renderTemplate = (host) => {
          const context = new Proxy(
            {},
            {
              get: (_target, key) => Reflect.get(this.tipGlideContext, key),
              has: (_target, key) => key in this.tipGlideContext,
            },
          );
          const view = this.container.createEmbeddedView(template, context);
          this.embedded = view;
          view.detectChanges();
          host.append(...view.rootNodes);
          return () => {
            if (this.embedded === view) this.embedded = undefined;
            view.destroy();
          };
        };
      }
      value = richContent(this.tipGlideDescription, this.renderTemplate!);
    }
    const group = typeof value === "object" && value !== null && !isRichContent(value);
    if (!this.binding || group !== this.group) {
      this.binding?.destroy();
      this.binding = group
        ? bindTipGlide(this.element.nativeElement, value as TipGlideAdapterOptions)
        : this.scope.attach(
            this.element.nativeElement,
            value as TipGlideContent | TipGlideRichContent,
          );
      this.group = group;
    } else if (group)
      (this.binding as ReturnType<typeof bindTipGlide>).update(value as TipGlideAdapterOptions);
    else (this.binding as TipGlideTrigger).update(value as TipGlideContent | TipGlideRichContent);
    if (this.embedded) {
      this.embedded.detectChanges();
    }
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

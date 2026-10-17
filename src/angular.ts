import { afterNextRender, DestroyRef, Directive, ElementRef, inject, Input } from "@angular/core";
import { bindTipGlide } from "./adapters/binding.js";
import type { TipGlideAdapterOptions } from "./adapters/binding.js";
export type { TipGlideAdapterOptions } from "./adapters/binding.js";

/**
 * Standalone Angular directive owning one group of `data-tip` triggers.
 * @remarks Import this directive in the component's `imports` and bind `[tipGlide]` on a native element.
 * Browser work starts after rendering, never during SSR. Destruction cancels pending setup and releases the group.
 * @example
 * ```ts
 * @Component({ imports: [TipGlideDirective], template: '<nav [tipGlide]="{ lean: true }"><button data-tip="Save">Save</button></nav>' })
 * export class Toolbar {}
 * ```
 * @public
 */
@Directive({ selector: "[tipGlide]", standalone: true })
export class TipGlideDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private binding: ReturnType<typeof bindTipGlide> | undefined;
  private options: TipGlideAdapterOptions | undefined;

  /** Full reactive configuration; omitted fields reset to defaults. Invalid values throw core validation errors. */
  @Input()
  set tipGlide(options: TipGlideAdapterOptions | "" | undefined) {
    const next = options === "" ? undefined : options;
    this.binding?.update(next);
    this.options = next;
  }

  /** Registers post-render setup and automatic destruction in the current Angular injection context. */
  constructor() {
    const pending = afterNextRender(() => {
      this.binding = bindTipGlide(this.element.nativeElement, this.options);
    });
    inject(DestroyRef).onDestroy(() => {
      pending.destroy();
      this.binding?.destroy();
      this.binding = undefined;
    });
  }
}

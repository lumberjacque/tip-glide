import { bindTipGlide } from "./binding.js";
import type { TipGlideAdapterOptions } from "./binding.js";

/**
 * Register `<tip-glide-group>` using the same binding as the framework adapters.
 * @remarks Import is SSR-safe. Call only in a browser; repeated calls are harmless.
 * Configure through the JSON `data-tip-glide-options` attribute. Import `tip-glide/style.css`.
 * @public
 */
export function registerTipGlideElement() {
  if (customElements.get("tip-glide-group")) return;
  class TipGlideElement extends HTMLElement {
    static observedAttributes = ["data-tip-glide-options"];
    private binding: ReturnType<typeof bindTipGlide> | undefined;
    private options(): TipGlideAdapterOptions {
      return JSON.parse(this.getAttribute("data-tip-glide-options") ?? "{}");
    }
    connectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected || this.binding) return;
        this.binding = bindTipGlide(this, this.options());
      });
    }
    attributeChangedCallback() {
      this.binding?.update(this.options());
    }
    disconnectedCallback() {
      this.binding?.destroy();
      this.binding = undefined;
    }
  }
  customElements.define("tip-glide-group", TipGlideElement);
}

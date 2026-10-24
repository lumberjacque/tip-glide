<script lang="ts">
  import type { Action } from 'svelte/action';
  import { useTooltip } from './svelte.js';
  import { richContent } from './rich.js';

  /** Required plain-text equivalent of the non-interactive default slot. */
  export let description: string;
  const attach = useTooltip();
  let target: HTMLElement | undefined;
  let update: ReturnType<typeof attach> | undefined;
  const render = (host: HTMLElement) => {
    target = host;
    return () => { target = undefined; };
  };
  const tooltip: Action<HTMLElement> = (element) => {
    update = attach(element, richContent(description, render));
    return { destroy() { update?.destroy?.(); update = undefined; } };
  };
  $: update?.update?.(richContent(description, render));
  const portal: Action<HTMLElement, HTMLElement> = (element, host) => {
    host.append(element);
    return { destroy() { element.remove(); } };
  };
</script>

<!-- Svelte 4/5: the trigger slot receives an action, not a wrapper element. -->
<slot name="trigger" {tooltip} />
{#if target}
  <div use:portal={target} style="display: contents"><slot /></div>
{/if}

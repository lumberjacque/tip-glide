<script lang="ts">
  import { tipGlide } from '../../src/svelte.js';
  import type { TipGlideAdapterOptions } from '../../src/svelte.js';
  import type { Writable } from 'svelte/store';
  export let state: Writable<{ text: string; options: TipGlideAdapterOptions }>;
</script>

<div use:tipGlide={$state.options}>
  <button data-tip={$state.text}>Save</button>
</div>

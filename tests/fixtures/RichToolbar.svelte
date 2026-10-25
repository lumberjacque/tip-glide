<script lang="ts">
  import { provideTipGlide } from '../../src/svelte.js';
  import Tooltip from '../../src/Tooltip.svelte';
  import type { Writable } from 'svelte/store';
  export let state: Writable<string>;
  provideTipGlide();
</script>

<Tooltip description="Pro plan">
  <button slot="trigger" let:tooltip use:tooltip>Plan</button>
  <strong>{$state}</strong>
</Tooltip>

<script lang="ts">
import { useTooltip } from '../../src/svelte.js';
import type { Writable } from "svelte/store";
export let state: Writable<{ text: string | null }>;
const tooltip = useTooltip();
</script>
<button use:tooltip={$state.text}>One</button>
<button use:tooltip={'Other'}>Two</button>

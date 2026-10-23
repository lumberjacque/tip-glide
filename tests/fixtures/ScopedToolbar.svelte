<script lang="ts">
import { provideTipGlide } from '../../src/svelte.js';
import ScopedTrigger from './ScopedTrigger.svelte';
import type { Writable } from "svelte/store";
export let state: Writable<{ text: string | null }>;
provideTipGlide({ className: 'central', warmDuration: 900 });
</script>
<ScopedTrigger {state} />

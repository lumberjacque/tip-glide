declare module "*.svelte" {
  const component: import("svelte").Component<{
    state: import("svelte/store").Writable<{
      text: string;
      options: import("../src/svelte.js").TipGlideAdapterOptions;
    }>;
  }>;
  export default component;
}

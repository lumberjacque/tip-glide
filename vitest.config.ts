import { defineConfig } from "vitest/config";
import { compile } from "svelte/compiler";

export default defineConfig({
  resolve: { conditions: ["browser"] },
  plugins: [
    {
      name: "svelte-test-fixtures",
      transform(source, id) {
        if (!id.endsWith(".svelte")) return;
        return compile(source, { filename: id, generate: "client" }).js;
      },
    },
  ],
  test: { environment: "happy-dom", include: ["tests/**/*.test.ts"] },
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createTipGlideScope } from "../src/scope.js";
import { TipGlide, TipGlideProvider, useTooltip } from "../src/react.js";
import { vTipGlide } from "../src/vue.js";
import { createTipGlide as createNative, supportsNativeTipGlide } from "../src/native.js";
import { registerTipGlideElement } from "../src/element.js";
import { tipGlide } from "../src/svelte.js";

function ServerTrigger() {
  const tooltip = useTooltip<HTMLButtonElement>("Save changes");
  return createElement("button", { ref: tooltip }, "Save");
}

describe("adapter server imports", () => {
  it("renders React markup without touching document and imports directive/action without DOM globals", () => {
    expect(typeof document).toBe("undefined");
    const scope = createTipGlideScope({ lean: true, warmDuration: 900 });
    scope.configure({ lean: false });
    scope.destroy();
    expect(supportsNativeTipGlide()).toBe(false);
    expect(typeof createNative).toBe("function");
    expect(typeof registerTipGlideElement).toBe("function");
    expect(
      renderToString(
        createElement(TipGlide, null, createElement("button", { "data-tip": "Save this" }, "Save")),
      ),
    ).toContain('data-tip="Save this"');
    expect(vTipGlide).toHaveProperty("mounted");
    expect(typeof tipGlide).toBe("function");
  });
});

it("server-renders the application provider without allocating browser resources", () => {
  expect(
    renderToString(
      createElement(TipGlideProvider, { options: { lean: true } }, createElement(ServerTrigger)),
    ),
  ).toContain("Save");
  expect(typeof document).toBe("undefined");
  expect(() => renderToString(createElement(ServerTrigger))).toThrow("requires TipGlideProvider");
});

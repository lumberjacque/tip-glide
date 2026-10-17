// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TipGlide } from "../src/react.js";
import { vTipGlide } from "../src/vue.js";
import { tipGlide } from "../src/svelte.js";

describe("adapter server imports", () => {
  it("renders React markup without touching document and imports directive/action without DOM globals", () => {
    expect(typeof document).toBe("undefined");
    expect(
      renderToString(
        createElement(TipGlide, null, createElement("button", { "data-tip": "Save this" }, "Save")),
      ),
    ).toContain('data-tip="Save this"');
    expect(vTipGlide).toHaveProperty("mounted");
    expect(typeof tipGlide).toBe("function");
  });
});

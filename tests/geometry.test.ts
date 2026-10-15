import { describe, expect, it, vi } from "vitest";
import { place, route, type Rect, type Point } from "../src/geometry.js";
import { along, createPathSampler } from "../src/motion.js";
import { skin } from "../src/skin.js";
import { resolveOptions } from "../src/options.js";

const viewport = { x: 0, y: 0, width: 800, height: 600 };
const size = { width: 120, height: 40 };

function resolvedAngle(anchor: Rect, position: Point): number {
  return (
    ((((Math.atan2(
      position.y + size.height / 2 - anchor.y - anchor.height / 2,
      position.x + size.width / 2 - anchor.x - anchor.width / 2,
    ) *
      180) /
      Math.PI +
      90) %
      360) +
      360) %
    360
  );
}

describe("placement", () => {
  it("measures segment lengths once rather than in every animation frame", () => {
    const measure = vi.spyOn(Math, "hypot");
    try {
      const sample = createPathSampler([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]);
      expect(measure).toHaveBeenCalledTimes(2);
      for (let frame = 0; frame <= 100; frame++) sample(frame / 100);
      expect(measure).toHaveBeenCalledTimes(2);
      expect(sample(0.75)).toEqual({ x: 10, y: 5 });
      expect(sample(1)).toEqual({ x: 10, y: 10 });
    } finally {
      measure.mockRestore();
    }
  });
  it.each([
    [0, "top"],
    [90, "right"],
    [180, "bottom"],
    [270, "left"],
    [360, "top"],
    [-90, "left"],
  ] as const)("uses compass direction %s → %s", (angle, side) => {
    const anchor = { x: 350, y: 250, width: 40, height: 40 };
    const numeric = place(anchor, size, viewport, angle, 12, 12);
    const named = place(anchor, size, viewport, side, 12, 12);
    expect(numeric.x).toBeCloseTo(named.x);
    expect(numeric.y).toBeCloseTo(named.y);
    expect(numeric.placement).toBe(side);
  });
  it("slides along a boundary without switching to a sampled angle", () => {
    const a = { x: 15, y: 200, width: 40, height: 40 };
    const first = place(a, size, viewport, 359.5, 12, 12);
    const next = place(a, size, viewport, 0.5, 12, 12);
    expect(first.x).toBe(12);
    expect(next.x).toBe(12);
    expect(first.placement).toBe("top");
    expect(Math.hypot(next.x - first.x, next.y - first.y)).toBeLessThan(1);
  });
  it("routes a side change around the trigger rather than through it", () => {
    const anchor = { x: 350, y: 250, width: 40, height: 40 };
    const path = route({ x: 320, y: 180 }, { x: 320, y: 330 }, anchor, size, viewport, 12, 12);
    expect(path.length).toBeGreaterThan(2);
    for (let i = 0; i <= 100; i++) {
      const p = along(path, i / 100);
      expect(
        p.x + size.width <= anchor.x - 11.99 ||
          p.x >= anchor.x + anchor.width + 11.99 ||
          p.y + size.height <= anchor.y - 11.99 ||
          p.y >= anchor.y + anchor.height + 11.99,
      ).toBe(true);
    }
  });
  it("keeps a single closed liquid contour for every pointer direction", () => {
    for (let angle = 0; angle < 360; angle += 5) {
      const radians = (angle * Math.PI) / 180;
      const path = skin(
        200,
        50,
        9,
        { x: 100 + Math.cos(radians) * 220, y: 25 + Math.sin(radians) * 220 },
        0.7,
      );
      expect(path.match(/M/g)).toHaveLength(1);
      expect(path.endsWith("Z")).toBe(true);
      expect(path).not.toMatch(/NaN|Infinity/);
    }
  });
  it("bounds the SVG contour work independently of tooltip dimensions", () => {
    for (const width of [80, 280, 1200]) {
      for (const radius of [0, 12, 100]) {
        for (let angle = 0; angle < 360; angle += 15) {
          const radians = (angle * Math.PI) / 180;
          const path = skin(
            width,
            80,
            radius,
            {
              x: width / 2 + Math.cos(radians) * 1600,
              y: 40 + Math.sin(radians) * 1600,
            },
            0.7,
          );
          expect(path).not.toMatch(/NaN|Infinity/);
          expect(path.match(/[MLCQAZ]/g)!.length).toBeLessThanOrEqual(16);
        }
      }
    }
  });
  it("centers above an anchor, with its origin pointing to the trigger", () => {
    expect(
      place({ x: 200, y: 200, width: 60, height: 40 }, size, viewport, "top", 12, 12),
    ).toMatchObject({ x: 170, y: 148, placement: "top", origin: "60px 40px" });
  });
  it("flips below a trigger near the top", () => {
    const position = place({ x: 200, y: 10, width: 60, height: 40 }, size, viewport, "top", 12, 12);
    expect(position.placement).toBe("bottom");
    expect(position.y).toBe(62);
  });
  it("shifts inside the viewport near a corner", () => {
    const position = place({ x: 0, y: 100, width: 20, height: 20 }, size, viewport, "top", 12, 12);
    expect(position.x).toBe(12);
    expect(position.y).toBeGreaterThanOrEqual(12);
  });
  it("can use a perpendicular side when neither vertical side fits", () => {
    expect(
      place({ x: 330, y: 10, width: 80, height: 570 }, size, viewport, "top", 12, 12).placement,
    ).toBe("left");
  });
  it("respects an offset visual viewport", () => {
    const position = place(
      { x: 100, y: 200, width: 40, height: 40 },
      size,
      { x: 100, y: 100, width: 400, height: 300 },
      "top",
      12,
      12,
    );
    expect(position.x).toBeGreaterThanOrEqual(112);
    expect(position.y).toBeGreaterThanOrEqual(112);
  });
  it("returns finite coordinates when content is larger than available space", () => {
    const position = place(
      { x: 0, y: 0, width: 20, height: 20 },
      { width: 1000, height: 1000 },
      viewport,
      "top",
      12,
      12,
    );
    expect(position.x).toBe(12);
    expect(position.y).toBe(12);
  });
  it.each([0, 45, 90, 135, 180, 225, 270, 315, 360, -45, 765])(
    "accepts %s degrees without overlapping the trigger",
    (angle) => {
      const anchor = { x: 350, y: 250, width: 40, height: 40 };
      const result = place(anchor, size, viewport, angle, 12, 12);
      const resolved = resolvedAngle(anchor, result);
      expect(resolved).toBeCloseTo(((angle % 360) + 360) % 360);
      expect(
        result.x + size.width <= anchor.x - 11.99 ||
          result.x >= anchor.x + anchor.width + 11.99 ||
          result.y + size.height <= anchor.y - 11.99 ||
          result.y >= anchor.y + anchor.height + 11.99,
      ).toBe(true);
      const originX = parseFloat(result.origin);
      expect(originX).toBeGreaterThanOrEqual(0);
      expect(originX).toBeLessThanOrEqual(size.width);
    },
  );
  it("finds a fitting angle in an offset container", () => {
    const bounds = { x: 200, y: 150, width: 300, height: 250 };
    const result = place({ x: 450, y: 180, width: 30, height: 30 }, size, bounds, 315, 12, 12);
    expect(resolvedAngle({ x: 450, y: 180, width: 30, height: 30 }, result)).not.toBeCloseTo(315);
    expect(result.x).toBeGreaterThanOrEqual(212);
    expect(result.x + size.width).toBeLessThanOrEqual(488);
    expect(result.y).toBeGreaterThanOrEqual(162);
    expect(result.y + size.height).toBeLessThanOrEqual(388);
  });
});

describe("options", () => {
  it.each([NaN, Infinity, -0.1, 1.1])("rejects invalid pointer blend %s", (arrowBlend) =>
    expect(() => resolveOptions({ arrowBlend })).toThrow(RangeError),
  );
  it.each([NaN, Infinity, -1])("rejects invalid timing %s", (duration) =>
    expect(() => resolveOptions({ duration })).toThrow(RangeError),
  );
  it("keeps omitted settings during updates", () => {
    const previous = resolveOptions({ openDelay: 800, lean: false });
    expect(resolveOptions({ showFuse: true }, previous)).toMatchObject({
      openDelay: 800,
      lean: false,
      showFuse: true,
    });
  });
  it("accepts zero timing for instant mode", () =>
    expect(resolveOptions({ duration: 0, openDelay: 0 }).duration).toBe(0));
  it.each([NaN, Infinity])("rejects nonfinite angles %s", (placement) =>
    expect(() => resolveOptions({ placement })).toThrow(),
  );
  it("accepts custom effects and rejects incomplete effects", () => {
    expect(
      resolveOptions({ enter: { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 80 } })
        .enter,
    ).toMatchObject({ duration: 80 });
    expect(() => resolveOptions({ exit: { keyframes: [] } })).toThrow();
    expect(() => resolveOptions({ enter: { keyframes: [{}, {}], duration: -1 } })).toThrow();
  });
});

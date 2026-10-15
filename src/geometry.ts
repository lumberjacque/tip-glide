import type { Placement } from "./types.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export type Side = "top" | "bottom" | "left" | "right";
export const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
export interface Position extends Point {
  placement: Side;
  origin: string;
}
const angles: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: 270 };
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));
const normalize = (value: number) => ((value % 360) + 360) % 360;

export function pointer(anchor: Rect, size: { width: number; height: number }, position: Point) {
  const dx = anchor.x + anchor.width / 2 - position.x - size.width / 2;
  const dy = anchor.y + anchor.height / 2 - position.y - size.height / 2;
  const horizontal =
    Math.abs(dx) / Math.max(1, size.width) > Math.abs(dy) / Math.max(1, size.height);
  const side: Side = horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
  const t = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : size.width / 2 / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : size.height / 2 / Math.abs(dy),
  );
  return {
    side,
    x: size.width / 2 + dx * (Number.isFinite(t) ? t : 0),
    y: size.height / 2 + dy * (Number.isFinite(t) ? t : 0),
  };
}

export function place(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: Rect,
  preferred: Placement,
  gap: number,
  padding: number,
): Position {
  const requested = typeof preferred === "number" ? normalize(preferred) : angles[preferred];
  const left = viewport.x + padding,
    top = viewport.y + padding;
  const right = viewport.x + viewport.width - padding - size.width,
    bottom = viewport.y + viewport.height - padding - size.height;
  const cx = anchor.x + anchor.width / 2,
    cy = anchor.y + anchor.height / 2;
  const dx = Math.sin((requested * Math.PI) / 180),
    dy = -Math.cos((requested * Math.PI) / 180);
  const travel = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : ((anchor.width + size.width) / 2 + gap) / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : ((anchor.height + size.height) / 2 + gap) / Math.abs(dy),
  );
  const raw = { x: cx + dx * travel - size.width / 2, y: cy + dy * travel - size.height / 2 };
  let x = clamp(raw.x, left, right),
    y = clamp(raw.y, top, bottom);
  const separated = (px: number, py: number) =>
    px + size.width <= anchor.x - gap + 1e-5 ||
    px >= anchor.x + anchor.width + gap - 1e-5 ||
    py + size.height <= anchor.y - gap + 1e-5 ||
    py >= anchor.y + anchor.height + gap - 1e-5;
  if (!separated(x, y)) {
    // Slide to the nearest feasible edge of the exclusion rectangle. No angular quantization.
    const candidates = [
      { x, y: anchor.y - size.height - gap },
      { x, y: anchor.y + anchor.height + gap },
      { x: anchor.x - size.width - gap, y },
      { x: anchor.x + anchor.width + gap, y },
    ];
    let best = Infinity;
    for (const candidate of candidates) {
      if (candidate.x < left || candidate.x > right || candidate.y < top || candidate.y > bottom)
        continue;
      const cost = Math.hypot(candidate.x - raw.x, candidate.y - raw.y);
      if (cost < best) {
        best = cost;
        x = candidate.x;
        y = candidate.y;
      }
    }
  }
  const arrow = pointer(anchor, size, { x, y });
  const placement: Side =
    y + size.height <= anchor.y - gap + 1e-5
      ? "top"
      : y >= anchor.y + anchor.height + gap - 1e-5
        ? "bottom"
        : x + size.width <= anchor.x - gap + 1e-5
          ? "left"
          : x >= anchor.x + anchor.width + gap - 1e-5
            ? "right"
            : opposite[arrow.side];
  return {
    x,
    y,
    placement,
    origin: `${arrow.x}px ${arrow.y}px`,
  };
}

// A tiny visibility graph routes a side change around the anchor instead of cutting through it.
export function route(
  from: Point,
  to: Point,
  anchor: Rect,
  size: { width: number; height: number },
  bounds: Rect,
  gap: number,
  padding: number,
): Point[] {
  const box = {
    left: anchor.x - size.width - gap,
    right: anchor.x + anchor.width + gap,
    top: anchor.y - size.height - gap,
    bottom: anchor.y + anchor.height + gap,
  };
  const inside = (p: Point) =>
    p.x > box.left + 0.01 &&
    p.x < box.right - 0.01 &&
    p.y > box.top + 0.01 &&
    p.y < box.bottom - 0.01;
  if (inside(from) || inside(to)) return [from, to];
  const blocked = (a: Point, b: Point) => {
    let start = 0,
      end = 1;
    for (const [v, d, lo, hi] of [
      [a.x, b.x - a.x, box.left + 0.01, box.right - 0.01],
      [a.y, b.y - a.y, box.top + 0.01, box.bottom - 0.01],
    ]) {
      if (Math.abs(d!) < 1e-8) {
        if (v! <= lo! || v! >= hi!) return false;
      } else {
        const t1 = (lo! - v!) / d!,
          t2 = (hi! - v!) / d!;
        start = Math.max(start, Math.min(t1, t2));
        end = Math.min(end, Math.max(t1, t2));
      }
    }
    return start < end;
  };
  if (!blocked(from, to)) return [from, to];
  const points = [
    from,
    to,
    ...[
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.right, y: box.bottom },
      { x: box.left, y: box.bottom },
    ].filter(
      (p) =>
        p.x >= bounds.x + padding &&
        p.x + size.width <= bounds.x + bounds.width - padding &&
        p.y >= bounds.y + padding &&
        p.y + size.height <= bounds.y + bounds.height - padding,
    ),
  ];
  const distances = points.map(() => Infinity),
    parents = points.map(() => -1),
    visited: boolean[] = [];
  distances[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let i = 0; i < points.length; i++)
      if (!visited[i] && (current < 0 || distances[i]! < distances[current]!)) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) break;
    visited[current] = true;
    for (let i = 0; i < points.length; i++) {
      if (visited[i] || blocked(points[current]!, points[i]!)) continue;
      const cost =
        distances[current]! +
        Math.hypot(points[i]!.x - points[current]!.x, points[i]!.y - points[current]!.y);
      if (cost < distances[i]!) {
        distances[i] = cost;
        parents[i] = current;
      }
    }
  }
  if (parents[1] === -1) return [from, to];
  const path: Point[] = [];
  for (let i = 1; i >= 0; i = parents[i]!) path.unshift(points[i]!);
  return path;
}

export function getViewport(win: Window): Rect {
  const viewport = win.visualViewport;
  return {
    x: viewport?.offsetLeft ?? 0,
    y: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? win.innerWidth,
    height: viewport?.height ?? win.innerHeight,
  };
}
export function getBoundary(win: Window, boundary: HTMLElement | null): Rect {
  const viewport = getViewport(win);
  if (!boundary) return viewport;
  const box = boundary.getBoundingClientRect();
  const x = Math.max(viewport.x, box.x + boundary.clientLeft),
    y = Math.max(viewport.y, box.y + boundary.clientTop);
  return {
    x,
    y,
    width: Math.max(
      0,
      Math.min(viewport.x + viewport.width, box.x + boundary.clientLeft + boundary.clientWidth) - x,
    ),
    height: Math.max(
      0,
      Math.min(viewport.y + viewport.height, box.y + boundary.clientTop + boundary.clientHeight) -
        y,
    ),
  };
}
export function intersects(a: Rect, b: Rect): boolean {
  return (
    b.width > 0 &&
    b.height > 0 &&
    a.x + a.width > b.x &&
    a.x < b.x + b.width &&
    a.y + a.height > b.y &&
    a.y < b.y + b.height
  );
}

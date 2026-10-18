import type { TipGlideBaseOptions } from "./base.js";

export type BaseOptions = Required<TipGlideBaseOptions> & { boundary: null };
const defaults: BaseOptions = {
  touch: "none",
  hideOnDrag: true,
  placement: "top",
  gap: 12,
  viewportPadding: 12,
  openDelay: 400,
  closeDelay: 120,
  warmDuration: 600,
  duration: 180,
  motion: "system",
  className: "",
  boundary: null,
};

export function resolveBaseOptions(input: TipGlideBaseOptions, previous = defaults): BaseOptions {
  const config = { ...previous, ...input, boundary: null };
  for (const key of [
    "gap",
    "viewportPadding",
    "openDelay",
    "closeDelay",
    "warmDuration",
    "duration",
  ] as const)
    if (!Number.isFinite(config[key]) || config[key] < 0)
      throw new RangeError(`tip-glide: invalid ${key}.`);
  if (
    !["top", "right", "bottom", "left"].includes(config.placement) ||
    !["system", "reduced"].includes(config.motion) ||
    typeof config.className !== "string" ||
    !["none", "tap"].includes(config.touch) ||
    typeof config.hideOnDrag !== "boolean"
  )
    throw new TypeError("tip-glide: invalid base configuration.");
  return config;
}

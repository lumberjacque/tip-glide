import type { TipGlideOptions } from "./types.js";

export type Options = Required<TipGlideOptions>;

const defaults: Options = {
  touch: "none",
  hideOnDrag: true,
  placement: "top",
  boundary: null,
  arrow: false,
  arrowBlend: 0.7,
  enter: "scale",
  exit: "scale",
  gap: 12,
  viewportPadding: 12,
  openDelay: 400,
  closeDelay: 120,
  warmDuration: 600,
  duration: 180,
  lean: true,
  showFuse: false,
  motion: "system",
  className: "",
};

function validate(valid: boolean, field: string, range = false): asserts valid {
  if (!valid) throw new (range ? RangeError : TypeError)(`tip-glide: invalid ${field}.`);
}
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

export function resolveOptions(input: TipGlideOptions, previous: Options = defaults): Options {
  const options = { ...previous, ...input };
  validate(nonnegative(options.arrowBlend) && options.arrowBlend <= 1, "arrowBlend", true);
  for (const key of [
    "gap",
    "viewportPadding",
    "openDelay",
    "closeDelay",
    "warmDuration",
    "duration",
  ] as const)
    validate(nonnegative(options[key]), key, true);
  validate(
    typeof options.placement === "number"
      ? Number.isFinite(options.placement)
      : ["top", "bottom", "left", "right"].includes(options.placement),
    "placement",
  );
  validate(["system", "reduced"].includes(options.motion), "motion");
  validate(["none", "tap"].includes(options.touch), "touch");
  for (const key of ["lean", "showFuse", "arrow", "hideOnDrag"] as const)
    validate(typeof options[key] === "boolean", key);
  validate(
    options.boundary === null || (!!options.boundary && options.boundary.nodeType === 1),
    "boundary",
  );
  for (const key of ["enter", "exit"] as const) {
    const effect = options[key];
    if (typeof effect === "string")
      validate(["scale", "fade", "slide", "none"].includes(effect), key);
    else {
      validate(
        !!effect && Array.isArray(effect.keyframes) && effect.keyframes.length >= 2,
        key + " keyframes",
      );
      validate(
        effect.duration === undefined || nonnegative(effect.duration),
        key + " duration",
        true,
      );
      validate(effect.easing === undefined || typeof effect.easing === "string", key + " easing");
    }
  }
  validate(typeof options.className === "string", "className");
  return options;
}

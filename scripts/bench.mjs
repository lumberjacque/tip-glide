import { skin } from "../dist/skin.js";
import { createPathSampler } from "../dist/motion.js";
import { route } from "../dist/geometry.js";

const iterations = 20_000;
const contour = (index) => skin(280, 64, 12, { x: 140 + 100 * Math.sin(index), y: 100 }, 0.7);
for (let index = 0; index < 2000; index++) contour(index);

let characters = 0;
const start = performance.now();
for (let index = 0; index < iterations; index++) characters += contour(index).length;
console.log(
  `Arrow contour: ${(((performance.now() - start) * 1000) / iterations).toFixed(2)} µs/call; ${(characters / iterations).toFixed(0)} path characters`,
);

const sample = createPathSampler([
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
]);
let checksum = 0;
const travelStart = performance.now();
for (let index = 0; index < iterations; index++) checksum += sample(index / (iterations - 1)).x;
console.log(
  `Prepared travel: ${(((performance.now() - travelStart) * 1000) / iterations).toFixed(2)} µs/sample; checksum ${checksum.toFixed(0)}`,
);
const routeStart = performance.now();
let routePoints = 0;
for (let index = 0; index < iterations; index++)
  routePoints += route(
    { x: 300, y: 200 },
    { x: 300, y: 400 },
    { x: 300, y: 300, width: 40, height: 40 },
    { width: 100, height: 40 },
    { x: 0, y: 0, width: 1200, height: 800 },
    12,
    12,
  ).length;
console.log(
  `Side-change route: ${(((performance.now() - routeStart) * 1000) / iterations).toFixed(2)} µs/call; ${(routePoints / iterations).toFixed(0)} points`,
);
console.log("Pure JavaScript only; this does not measure browser layout, paint or FPS.");

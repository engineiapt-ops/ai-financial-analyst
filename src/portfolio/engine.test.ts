import { strict as assert } from "node:assert";
import { runPortfolioEngine } from "./engine.js";

await assert.rejects(
  () => runPortfolioEngine({ sourceRunId: 1, initialCapital: 0 }),
  /initialCapital must be greater than zero/,
);

await assert.rejects(
  () => runPortfolioEngine({ sourceRunId: 1, positionSizePct: 101 }),
  /positionSizePct must be between 0 and 100/,
);

await assert.rejects(
  () => runPortfolioEngine({ sourceRunId: 1, positionSizePct: 3, maxGrossExposurePct: 2 }),
  /positionSizePct cannot exceed maxGrossExposurePct/,
);

console.log("portfolio engine tests passed");

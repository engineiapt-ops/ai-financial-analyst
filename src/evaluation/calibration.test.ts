import assert from "node:assert/strict";
import { buildCalibrationReport } from "./calibration.js";

const report = buildCalibrationReport(
  [
    { confidence: 0.9, qualityScore: 0.9, tradeProfitPercent: 2, origem: "jev", ativo: "BTCUSDT", timeframe: "1h", riskRegime: "normal" },
    { confidence: 0.8, qualityScore: 0.8, tradeProfitPercent: 1, origem: "jev", ativo: "BTCUSDT", timeframe: "1h", riskRegime: "normal" },
    { confidence: 0.7, qualityScore: 0.7, tradeProfitPercent: -1, origem: "jev", ativo: "BTCUSDT", timeframe: "1h", riskRegime: "normal" },
    { confidence: 0.4, qualityScore: 0.4, tradeProfitPercent: -2, origem: "jev", ativo: "BTCUSDT", timeframe: "1h", riskRegime: "high" },
    { confidence: 0.2, qualityScore: 0.2, tradeProfitPercent: 1, origem: "jev", ativo: "BTCUSDT", timeframe: "1h", riskRegime: "normal" },
  ],
  { ativo: "BTCUSDT", timeframe: "1h", origem: "jev" },
);

assert.equal(report.sampleCount, 5);
assert.equal(report.sufficientSample, false);
assert.equal(report.confidence.bins.length, 5);
assert.ok(report.confidence.brierScore !== null);
assert.ok(report.confidence.expectedCalibrationError !== null);
assert.equal(report.qualityScore.bands.length, 5);

const highConfidence = report.confidence.bins.find((bin) => bin.label === "80%-100%");
assert.equal(highConfidence?.count, 2);
assert.equal(highConfidence?.observedWinRate, 1);

const lowQuality = report.qualityScore.bands.find((band) => band.label === "20%-40%");
assert.equal(lowQuality?.count, 1);

console.log("calibration tests passed");

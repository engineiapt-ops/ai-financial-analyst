import type { DecisionKpiFilters } from "../db/repository.js";

export interface CalibrationObservation {
  confidence: number;
  qualityScore: number | null;
  tradeProfitPercent: number;
  origem: string;
  ativo: string;
  timeframe: "1h" | "4h" | "1d";
  riskRegime: string;
}

export interface ConfidenceCalibrationBin {
  label: string;
  lowerBound: number;
  upperBound: number;
  count: number;
  avgConfidence: number;
  observedWinRate: number;
  calibrationGap: number;
}

export interface QualityScoreBand {
  label: string;
  lowerBound: number;
  upperBound: number;
  count: number;
  avgQualityScore: number;
  observedWinRate: number;
  avgTradeProfitPercent: number;
}

export interface CalibrationReport {
  filters: DecisionKpiFilters;
  sampleCount: number;
  sufficientSample: boolean;
  minimumRecommendedSample: number;
  confidence: {
    brierScore: number | null;
    expectedCalibrationError: number | null;
    bins: ConfidenceCalibrationBin[];
  };
  qualityScore: {
    bands: QualityScoreBand[];
  };
}

const BIN_COUNT = 5;
export const MINIMUM_RECOMMENDED_SAMPLE = 30;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function binBounds(index: number): { lower: number; upper: number } {
  const lower = index / BIN_COUNT;
  const upper = index === BIN_COUNT - 1 ? 1 : (index + 1) / BIN_COUNT;
  return { lower, upper };
}

function binLabel(lower: number, upper: number): string {
  return indexToPercent(lower) + "-" + indexToPercent(upper);
}

function indexToPercent(value: number): string {
  return Math.round(value * 100) + "%";
}

function findBinIndex(value: number): number {
  if (value >= 1) return BIN_COUNT - 1;
  return Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(value * BIN_COUNT)));
}

function safeAverage(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }

  if (denominatorX === 0 || denominatorY === 0) return null;
  return numerator / Math.sqrt(denominatorX * denominatorY);
}

export function buildCalibrationReport(
  observations: CalibrationObservation[],
  filters: DecisionKpiFilters = {},
): CalibrationReport {
  const valid = observations.filter(
    (observation) =>
      Number.isFinite(observation.confidence) &&
      observation.confidence >= 0 &&
      observation.confidence <= 1 &&
      Number.isFinite(observation.tradeProfitPercent),
  );

  const confidenceBins = Array.from({ length: BIN_COUNT }, (_, index) => {
    const { lower, upper } = binBounds(index);
    const items = valid.filter((observation) => {
      const confidence = clamp01(observation.confidence);
      return confidence >= lower && confidence <= upper && (
        index === BIN_COUNT - 1 || confidence < upper
      );
    });

    const wins = items.filter((observation) => observation.tradeProfitPercent > 0).length;
    const avgConfidence = safeAverage(items.map((observation) => observation.confidence)) ?? 0;
    const observedWinRate = items.length ? wins / items.length : 0;

    return {
      label: binLabel(lower, upper),
      lowerBound: lower,
      upperBound: upper,
      count: items.length,
      avgConfidence,
      observedWinRate,
      calibrationGap: observedWinRate - avgConfidence,
    };
  });

  const brierValues = valid.map((observation) => {
    const expected = clamp01(observation.confidence);
    const observed = observation.tradeProfitPercent > 0 ? 1 : 0;
    return (expected - observed) ** 2;
  });

  const ece = valid.length
    ? confidenceBins.reduce(
        (sum, bin) => sum + (bin.count / valid.length) * Math.abs(bin.calibrationGap),
        0,
      )
    : null;

  const qualityBands = Array.from({ length: BIN_COUNT }, (_, index) => {
    const { lower, upper } = binBounds(index);
    const items = valid.filter((observation) => {
      if (observation.qualityScore === null || !Number.isFinite(observation.qualityScore)) return false;
      const score = clamp01(observation.qualityScore);
      return score >= lower && score <= upper && (
        index === BIN_COUNT - 1 || score < upper
      );
    });

    const wins = items.filter((observation) => observation.tradeProfitPercent > 0).length;

    return {
      label: binLabel(lower, upper),
      lowerBound: lower,
      upperBound: upper,
      count: items.length,
      avgQualityScore: safeAverage(items.map((observation) => clamp01(observation.qualityScore!))) ?? 0,
      observedWinRate: items.length ? wins / items.length : 0,
      avgTradeProfitPercent: safeAverage(items.map((observation) => observation.tradeProfitPercent)) ?? 0,
    };
  });

  return {
    filters,
    sampleCount: valid.length,
    sufficientSample: valid.length >= MINIMUM_RECOMMENDED_SAMPLE,
    minimumRecommendedSample: MINIMUM_RECOMMENDED_SAMPLE,
    confidence: {
      brierScore: safeAverage(brierValues),
      expectedCalibrationError: ece,
      bins: confidenceBins,
    },
    qualityScore: {
      bands: qualityBands,
    },
  };
}

export { pearsonCorrelation };

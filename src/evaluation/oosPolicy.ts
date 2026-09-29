export const OOS_EVALUATION_POLICY_VERSION = "oos-policy.v1";
export const DEFAULT_OOS_START_RATIO = 0.7;
export const MIN_CALIBRATION_CANDLES = 100;
export const MIN_VALIDATION_CANDLES = 100;

export interface OosEvaluationPlan {
  policyVersion: typeof OOS_EVALUATION_POLICY_VERSION;
  oosStartRatio: number;
  calibrationStartIndex: number;
  calibrationEndIndex: number;
  validationStartIndex: number;
  validationEndIndex: number;
  calibrationCandleCount: number;
  validationCandleCount: number;
}

export interface OosEvaluationTimestamps {
  calibrationEnd: Date;
  validationStart: Date;
}

function validateRatio(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error("oosStartRatio must be greater than 0 and less than 1");
  }
}

export function buildOosEvaluationPlan(
  candleCount: number,
  oosStartRatio = DEFAULT_OOS_START_RATIO,
): OosEvaluationPlan {
  validateRatio(oosStartRatio);

  if (!Number.isInteger(candleCount) || candleCount < MIN_CALIBRATION_CANDLES + MIN_VALIDATION_CANDLES) {
    throw new Error(
      `OOS evaluation requires at least ${MIN_CALIBRATION_CANDLES + MIN_VALIDATION_CANDLES} candles`,
    );
  }

  const validationStartIndex = Math.floor(candleCount * oosStartRatio);
  const calibrationEndIndex = validationStartIndex - 1;
  const validationEndIndex = candleCount - 1;

  const calibrationCandleCount = calibrationEndIndex + 1;
  const validationCandleCount = validationEndIndex - validationStartIndex + 1;

  if (calibrationCandleCount < MIN_CALIBRATION_CANDLES) {
    throw new Error("OOS calibration window is smaller than the minimum required");
  }
  if (validationCandleCount < MIN_VALIDATION_CANDLES) {
    throw new Error("OOS validation window is smaller than the minimum required");
  }
  if (calibrationEndIndex >= validationStartIndex) {
    throw new Error("OOS calibration and validation windows overlap");
  }

  return {
    policyVersion: OOS_EVALUATION_POLICY_VERSION,
    oosStartRatio,
    calibrationStartIndex: 0,
    calibrationEndIndex,
    validationStartIndex,
    validationEndIndex,
    calibrationCandleCount,
    validationCandleCount,
  };
}

export function assertOosTimestampsSeparated(
  calibrationEnd: Date,
  validationStart: Date,
): OosEvaluationTimestamps {
  if (!(calibrationEnd instanceof Date) || Number.isNaN(calibrationEnd.getTime())) {
    throw new Error("calibrationEnd must be a valid date");
  }
  if (!(validationStart instanceof Date) || Number.isNaN(validationStart.getTime())) {
    throw new Error("validationStart must be a valid date");
  }
  if (validationStart.getTime() <= calibrationEnd.getTime()) {
    throw new Error("validationStart must be strictly after calibrationEnd");
  }

  return { calibrationEnd, validationStart };
}

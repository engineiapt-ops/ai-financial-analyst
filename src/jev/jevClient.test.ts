import { strict as assert } from "node:assert";
import type { MarketState } from "../types.js";
import { callJev } from "./jevClient.js";

const market = {
  ativo: "BTCUSDT",
  timeframe: "1h",
  timestamp: 1790762400000,
  dataAsOf: 1790758800000,
  precoAtual: 100,
  indicators: { ema9: 101, ema21: 99, rsi: 55, vwap: 100, atr: 2 },
  noticiaSentimento: 0,
  macroDolar: "0",
  indicadorMacro: 0,
} as MarketState;

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERROR",
    headers: new Headers(headers),
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

function validBody(modelVersion?: string): unknown {
  return {
    ...(modelVersion ? { modelVersion } : {}),
    answers: {
      direcao: {
        choice: "ALTA",
        probabilities: { ALTA: 0.7, BAIXA: 0.2, AGUARDAR: 0.1 },
        confidence: 0.8,
      },
      risco_elevado: { noul: 0.1, probabilities: {}, confidence: 0.9 },
      qualidade: { score: 0.9, probabilities: {}, confidence: 0.9 },
    },
  };
}

process.env.JEV_MODEL_VERSION = "jev-2026-09";

const success = await callJev(market, {
  credential: "test-secret",
  fetchImpl: async () => response(validBody("jev-2026-09")),
});
assert.equal(success.modelVersion, "jev-2026-09");
assert.equal(success.direcao.choice, "ALTA");

let invalid = false;
try {
  await callJev(market, {
    credential: "test-secret",
    fetchImpl: async () => response({ answers: { direcao: {} } }),
  });
} catch (error) {
  invalid = error instanceof Error && error.message.includes("campos obrigatórios");
}
assert.equal(invalid, true);

const retryStatuses = [429, 500, 200];
let retryCalls = 0;
const retried = await callJev(market, {
  credential: "test-secret",
  sleepImpl: async () => {},
  fetchImpl: async () => {
    const status = retryStatuses[retryCalls++];
    return response(status === 200 ? validBody("jev-2026-09") : "retry", status);
  },
});
assert.equal(retried.modelVersion, "jev-2026-09");
assert.equal(retryCalls, 3);

const timeout = await (async () => {
  try {
    await callJev(market, {
      credential: "test-secret",
      timeoutMs: 5,
      fetchImpl: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("timed out");
  }
})();
assert.equal(timeout, true);

process.env.JEV_MODEL_VERSION = "jev-expected";
let divergence = false;
try {
  await callJev(market, {
    credential: "test-secret",
    fetchImpl: async () => response(validBody("jev-returned")),
  });
} catch (error) {
  divergence = error instanceof Error && error.message.includes("Jev model version mismatch");
}
assert.equal(divergence, true);

delete process.env.JEV_MODEL_VERSION;
let unreportedWarning = false;
const originalWarn = console.warn;
console.warn = (message?: unknown) => {
  unreportedWarning = String(message).includes("jev_model_version_unreported");
};
try {
  const unreported = await callJev(market, {
    credential: "test-secret",
    fetchImpl: async () => response(validBody()),
  });
  assert.equal(unreported.modelVersion, "unreported");
  assert.equal(unreportedWarning, true);
} finally {
  console.warn = originalWarn;
}

console.log("jev client tests passed");
